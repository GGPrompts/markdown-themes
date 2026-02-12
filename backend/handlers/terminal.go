package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
)

// TerminalSession represents an active terminal with a PTY attached to a tmux session
type TerminalSession struct {
	ID          string    `json:"id"`
	TmuxSession string    `json:"tmuxSession"` // tmux session name (same as ID for mt-* terminals)
	Cwd         string    `json:"cwd"`
	Cols        uint16    `json:"cols"`
	Rows        uint16    `json:"rows"`
	CreatedAt   time.Time `json:"createdAt"`

	ptmx *os.File
	cmd  *exec.Cmd

	// Subscribed WebSocket clients (managed via interface to avoid import cycle)
	clients map[interface{}]bool
	mu      sync.Mutex

	// Stop signal for the read goroutine
	done chan struct{}

	// Supersession: when a new PTY attachment replaces this one during
	// reconnect, superseded is set to true so the output reader goroutine
	// silently stops broadcasting and cleans up the old PTY.
	superseded   bool
	supersededMu sync.Mutex
}

// TerminalManager manages active terminal sessions
type TerminalManager struct {
	sessions         map[string]*TerminalSession
	disconnectTimers map[string]*time.Timer
	mu               sync.RWMutex

	// Spawn deduplication: request-level (exact requestId) and semantic-level
	// (same profile+cwd within a short window). Both use a 5-second TTL.
	recentSpawnRequests map[string]time.Time // requestId → timestamp
	recentSpawnKeys     map[string]time.Time // "{profile}_{cwd}" → timestamp
	dedupMu             sync.Mutex

	// Callback to broadcast terminal output to subscribed clients
	broadcastFunc func(sessionID string, data []byte)
	// Callback to notify session closed
	closedFunc func(sessionID string)
}

var (
	termManager     *TerminalManager
	termManagerOnce sync.Once
)

// spawnDedupTTL is how long request IDs and spawn keys are remembered.
const spawnDedupTTL = 5 * time.Second

// GetTerminalManager returns the singleton TerminalManager
func GetTerminalManager() *TerminalManager {
	termManagerOnce.Do(func() {
		termManager = &TerminalManager{
			sessions:            make(map[string]*TerminalSession),
			disconnectTimers:    make(map[string]*time.Timer),
			recentSpawnRequests: make(map[string]time.Time),
			recentSpawnKeys:     make(map[string]time.Time),
		}
		// Background goroutine prunes stale dedup entries every 10 seconds.
		go termManager.pruneSpawnDedup()
	})
	return termManager
}

// pruneSpawnDedup periodically removes expired entries from the dedup maps.
func (tm *TerminalManager) pruneSpawnDedup() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		tm.dedupMu.Lock()
		for id, t := range tm.recentSpawnRequests {
			if now.Sub(t) > spawnDedupTTL {
				delete(tm.recentSpawnRequests, id)
			}
		}
		for key, t := range tm.recentSpawnKeys {
			if now.Sub(t) > spawnDedupTTL {
				delete(tm.recentSpawnKeys, key)
			}
		}
		tm.dedupMu.Unlock()
	}
}

// CheckSpawnDedup returns an error if the requestId or spawn key
// (profileName + cwd) was already seen within the dedup window.
// On success it records both so future duplicates are rejected.
func (tm *TerminalManager) CheckSpawnDedup(requestID, spawnKey string) error {
	tm.dedupMu.Lock()
	defer tm.dedupMu.Unlock()

	now := time.Now()

	// Layer 1: exact request-ID dedup (catches React StrictMode double-fires)
	if requestID != "" {
		if t, seen := tm.recentSpawnRequests[requestID]; seen && now.Sub(t) <= spawnDedupTTL {
			return fmt.Errorf("duplicate spawn request %s (seen %v ago)", requestID, now.Sub(t).Round(time.Millisecond))
		}
		tm.recentSpawnRequests[requestID] = now
	}

	// Layer 2: semantic spawn-key dedup (catches rapid clicks generating different IDs)
	if spawnKey != "" {
		if t, seen := tm.recentSpawnKeys[spawnKey]; seen && now.Sub(t) <= spawnDedupTTL {
			return fmt.Errorf("duplicate spawn key %q (seen %v ago)", spawnKey, now.Sub(t).Round(time.Millisecond))
		}
		tm.recentSpawnKeys[spawnKey] = now
	}

	return nil
}

// SetBroadcastFunc sets the callback for broadcasting terminal output
func (tm *TerminalManager) SetBroadcastFunc(fn func(sessionID string, data []byte)) {
	tm.broadcastFunc = fn
}

// SetClosedFunc sets the callback for session closed notifications
func (tm *TerminalManager) SetClosedFunc(fn func(sessionID string)) {
	tm.closedFunc = fn
}

// getShell returns the user's default shell
func getShell() string {
	shell := os.Getenv("SHELL")
	if shell != "" {
		return shell
	}
	// Fallback
	if _, err := os.Stat("/bin/bash"); err == nil {
		return "/bin/bash"
	}
	return "/bin/sh"
}

// tmuxConfigPath returns the absolute path to the self-contained tmux config.
func tmuxConfigPath() string {
	// Look relative to the running binary first, then fall back to cwd.
	// The config lives at the project root: .tmux-markdown-themes.conf
	exe, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(exe), ".tmux-markdown-themes.conf")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	cwd, _ := os.Getwd()
	candidate := filepath.Join(cwd, ".tmux-markdown-themes.conf")
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	// Final fallback: walk up from the executable looking for the project root
	if exe != "" {
		dir := filepath.Dir(exe)
		for i := 0; i < 5; i++ {
			candidate = filepath.Join(dir, ".tmux-markdown-themes.conf")
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
			dir = filepath.Dir(dir)
		}
	}
	return ".tmux-markdown-themes.conf" // last resort, let tmux fail with a clear error
}

// tmuxCmd creates an exec.Cmd for tmux with our self-contained config via -f flag.
func tmuxCmd(args ...string) *exec.Cmd {
	fullArgs := append([]string{"-f", tmuxConfigPath()}, args...)
	return exec.Command("tmux", fullArgs...)
}

// tmuxHasSession checks whether a tmux session with the given name exists.
func tmuxHasSession(name string) bool {
	cmd := tmuxCmd("has-session", "-t", name)
	return cmd.Run() == nil
}

// tmuxKillSession kills a tmux session by name.
func tmuxKillSession(name string) {
	cmd := tmuxCmd("kill-session", "-t", name)
	if err := cmd.Run(); err != nil {
		log.Printf("[Terminal] tmux kill-session %s: %v", name, err)
	}
}

// parentTerminalVars lists environment variables set by terminal emulators
// and multiplexers that should NOT leak into spawned PTY sessions.
var parentTerminalVars = []string{
	"TMUX",
	"TMUX_PANE",
	"TERM_PROGRAM",
	"TERM_PROGRAM_VERSION",
	"TERM_SESSION_ID",
	"STY",                // GNU Screen
	"WT_SESSION",         // Windows Terminal
	"WEZTERM_EXECUTABLE", // WezTerm
	"ALACRITTY_SOCKET",   // Alacritty
	"KITTY_WINDOW_ID",    // Kitty
	"ITERM_SESSION_ID",   // iTerm2
}

// buildPTYEnv constructs a clean environment for a child PTY session.
// It starts from the current process environment, removes parent terminal
// variables, adds markdown-themes identification vars, and layers in
// PTY-specific settings (TERM, locale, color support, etc.).
func buildPTYEnv(sessionID string, cols, rows uint16) []string {
	// Parse os.Environ() into a map (last value wins for duplicates)
	envMap := make(map[string]string, 64)
	for _, entry := range os.Environ() {
		if k, v, ok := strings.Cut(entry, "="); ok {
			envMap[k] = v
		}
	}

	// Remove parent terminal/multiplexer variables
	for _, key := range parentTerminalVars {
		delete(envMap, key)
	}

	// Markdown-themes identification
	envMap["MDT_TERMINAL"] = "1"
	envMap["MDT_SESSION_ID"] = sessionID

	// Terminal type and geometry
	envMap["TERM"] = "xterm-256color"
	envMap["COLUMNS"] = fmt.Sprintf("%d", cols)
	envMap["LINES"] = fmt.Sprintf("%d", rows)

	// UTF-8 locale (needed for Bubbletea/lipgloss/ncurses TUI apps)
	if envMap["LANG"] == "" {
		envMap["LANG"] = "en_US.UTF-8"
	}
	if envMap["LC_ALL"] == "" {
		envMap["LC_ALL"] = "en_US.UTF-8"
	}

	// Truecolor support detection for lipgloss/charm/termenv
	envMap["COLORTERM"] = "truecolor"
	// Tell lipgloss/charm about dark background (15=white fg, 0=black bg)
	envMap["COLORFGBG"] = "15;0"
	// Force ncurses to use UTF-8 box-drawing instead of ACS fallback
	envMap["NCURSES_NO_UTF8_ACS"] = "1"
	// Force color output in Node.js apps (chalk, etc.)
	envMap["FORCE_COLOR"] = "1"

	// Convert map back to []string
	env := make([]string, 0, len(envMap))
	for k, v := range envMap {
		env = append(env, k+"="+v)
	}
	return env
}

// SpawnSession creates a new terminal session backed by a tmux session.
// It first creates a detached tmux session, force-reloads the config, then
// attaches a PTY to the tmux session. The tmux session survives PTY/WebSocket
// disconnects so clients can reconnect later.
func (tm *TerminalManager) SpawnSession(id, cwd string, cols, rows uint16, command string) (*TerminalSession, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if _, exists := tm.sessions[id]; exists {
		return nil, fmt.Errorf("session %s already exists", id)
	}

	// Validate/default cwd
	if cwd == "" {
		cwd, _ = os.UserHomeDir()
	}
	if _, err := os.Stat(cwd); err != nil {
		cwd, _ = os.UserHomeDir()
	}

	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	// The tmux session name matches the terminal ID (mt-{profile}-{uuid}).
	tmuxSessionName := id
	configPath := tmuxConfigPath()

	// Build clean env for the tmux session.
	env := buildPTYEnv(id, cols, rows)

	// Step 1: Create detached tmux session.
	// If a command was specified, wrap it in a login shell invocation.
	shell := getShell()
	var shellCmd string
	if command != "" {
		shellCmd = shell + " -l -c " + command
	} else {
		shellCmd = shell + " -l"
	}

	createArgs := []string{
		"-f", configPath,
		"new-session", "-d",
		"-s", tmuxSessionName,
		"-c", cwd,
		"-x", fmt.Sprintf("%d", cols),
		"-y", fmt.Sprintf("%d", rows),
		shellCmd,
	}
	createCmd := exec.Command("tmux", createArgs...)
	createCmd.Env = env
	if out, err := createCmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("tmux new-session failed: %w (output: %s)", err, strings.TrimSpace(string(out)))
	}

	// Step 2: Force-reload config to handle pre-existing tmux server with different settings.
	reloadCmd := tmuxCmd("source-file", configPath)
	if out, err := reloadCmd.CombinedOutput(); err != nil {
		log.Printf("[Terminal] tmux source-file warning: %v (output: %s)", err, strings.TrimSpace(string(out)))
	}

	// Step 3: Attach PTY to the tmux session.
	session, err := tm.attachToTmux(id, tmuxSessionName, cwd, cols, rows, env)
	if err != nil {
		// Clean up the tmux session we just created.
		tmuxKillSession(tmuxSessionName)
		return nil, err
	}

	log.Printf("[Terminal] Session %s spawned (tmux: %s, cwd: %s, %dx%d)", id, tmuxSessionName, cwd, cols, rows)
	return session, nil
}

// ReconnectSession attaches a new PTY to an existing tmux session.
// The tmux session must already exist (checked by caller).
// If an old PTY attachment exists, it is superseded: the old output reader
// stops broadcasting and the old PTY fd is closed, preventing duplicate output.
func (tm *TerminalManager) ReconnectSession(id, tmuxSessionName string, cols, rows uint16) (*TerminalSession, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	// If we already have a live PTY for this session, supersede it so its
	// output reader stops broadcasting. This prevents duplicate output when
	// a new PTY attachment races with the old one.
	if oldSession, exists := tm.sessions[id]; exists {
		log.Printf("[Terminal] ReconnectSession %s: superseding old PTY attachment", id)
		oldSession.supersededMu.Lock()
		oldSession.superseded = true
		oldSession.supersededMu.Unlock()
		// Remove from map so attachToTmux can register the new session.
		delete(tm.sessions, id)
		// Clean up old PTY fd and process in background.
		go func() {
			oldSession.ptmx.Close()
			doneCh := make(chan error, 1)
			go func() { doneCh <- oldSession.cmd.Wait() }()
			select {
			case <-doneCh:
			case <-time.After(2 * time.Second):
				oldSession.cmd.Process.Kill()
			}
			log.Printf("[Terminal] Old PTY for %s cleaned up after supersession", id)
		}()
	}

	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	env := buildPTYEnv(id, cols, rows)
	session, err := tm.attachToTmux(id, tmuxSessionName, "", cols, rows, env)
	if err != nil {
		return nil, err
	}

	log.Printf("[Terminal] Session %s reconnected to tmux session %s", id, tmuxSessionName)
	return session, nil
}

// attachToTmux creates a PTY running `tmux attach-session -t <name>` and
// registers it in the session map. Caller must hold tm.mu.
func (tm *TerminalManager) attachToTmux(id, tmuxSessionName, cwd string, cols, rows uint16, env []string) (*TerminalSession, error) {
	configPath := tmuxConfigPath()
	cmd := exec.Command("tmux", "-f", configPath, "attach-session", "-t", tmuxSessionName)
	if cwd != "" {
		cmd.Dir = cwd
	}
	cmd.Env = env

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: cols,
		Rows: rows,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to attach PTY to tmux session %s: %w", tmuxSessionName, err)
	}

	session := &TerminalSession{
		ID:          id,
		TmuxSession: tmuxSessionName,
		Cwd:         cwd,
		Cols:        cols,
		Rows:        rows,
		CreatedAt:   time.Now(),
		ptmx:        ptmx,
		cmd:         cmd,
		clients:     make(map[interface{}]bool),
		done:        make(chan struct{}),
	}

	tm.sessions[id] = session

	// Start reading PTY output in background
	go tm.readPTY(session)

	// Wait for attach process exit in background.
	// Note: When the PTY (tmux attach) exits, the tmux session itself keeps running.
	// This allows reconnection later.
	go func() {
		cmd.Wait()
		tm.mu.Lock()
		_, stillActive := tm.sessions[id]
		if stillActive {
			delete(tm.sessions, id)
		}
		if timer, exists := tm.disconnectTimers[id]; exists {
			timer.Stop()
			delete(tm.disconnectTimers, id)
		}
		tm.mu.Unlock()

		if stillActive {
			session.ptmx.Close()
			// Only notify closed if the tmux session itself is dead.
			// If tmux session still exists, it means the PTY attach exited
			// but the session is alive for reconnection.
			if !tmuxHasSession(tmuxSessionName) {
				log.Printf("[Terminal] Session %s tmux session exited", id)
				if tm.closedFunc != nil {
					tm.closedFunc(id)
				}
			} else {
				log.Printf("[Terminal] Session %s PTY detached, tmux session %s still alive", id, tmuxSessionName)
			}
		}
	}()

	return session, nil
}

// readPTY reads from the PTY and broadcasts to subscribed clients.
// If the session is superseded (a new PTY replaced this one during reconnect),
// the loop exits silently to prevent duplicate output.
func (tm *TerminalManager) readPTY(session *TerminalSession) {
	buf := make([]byte, 32*1024)
	for {
		select {
		case <-session.done:
			return
		default:
		}

		// Check if this session has been superseded by a new PTY attachment.
		session.supersededMu.Lock()
		if session.superseded {
			session.supersededMu.Unlock()
			log.Printf("[Terminal] readPTY for %s: superseded, stopping output reader", session.ID)
			return
		}
		session.supersededMu.Unlock()

		n, err := session.ptmx.Read(buf)
		if n > 0 {
			// Re-check superseded after the (potentially blocking) read returns,
			// so we don't broadcast stale data from the old PTY.
			session.supersededMu.Lock()
			isSuperseded := session.superseded
			session.supersededMu.Unlock()
			if isSuperseded {
				log.Printf("[Terminal] readPTY for %s: superseded after read, dropping %d bytes", session.ID, n)
				return
			}
			if tm.broadcastFunc != nil {
				data := make([]byte, n)
				copy(data, buf[:n])
				tm.broadcastFunc(session.ID, data)
			}
		}
		if err != nil {
			if err != io.EOF {
				// Suppress read errors for superseded sessions (fd was closed).
				session.supersededMu.Lock()
				isSuperseded := session.superseded
				session.supersededMu.Unlock()
				if !isSuperseded {
					log.Printf("[Terminal] Read error for %s: %v", session.ID, err)
				}
			}
			break
		}
	}
}

// WriteToSession writes input data to a terminal session's PTY
func (tm *TerminalManager) WriteToSession(id string, data []byte) error {
	tm.mu.RLock()
	session, ok := tm.sessions[id]
	tm.mu.RUnlock()

	if !ok {
		return fmt.Errorf("session %s not found", id)
	}

	_, err := session.ptmx.Write(data)
	return err
}

// ResizeSession resizes the PTY
func (tm *TerminalManager) ResizeSession(id string, cols, rows uint16) error {
	tm.mu.RLock()
	session, ok := tm.sessions[id]
	tm.mu.RUnlock()

	if !ok {
		return fmt.Errorf("session %s not found", id)
	}

	if err := pty.Setsize(session.ptmx, &pty.Winsize{Cols: cols, Rows: rows}); err != nil {
		return fmt.Errorf("failed to resize PTY: %w", err)
	}

	session.mu.Lock()
	session.Cols = cols
	session.Rows = rows
	session.mu.Unlock()

	return nil
}

// CloseSession kills a terminal session AND its underlying tmux session.
func (tm *TerminalManager) CloseSession(id string) error {
	tm.mu.Lock()
	session, ok := tm.sessions[id]
	if !ok {
		tm.mu.Unlock()
		return fmt.Errorf("session %s not found", id)
	}
	delete(tm.sessions, id)
	// Cancel any pending grace timer so it does not fire after close.
	if timer, exists := tm.disconnectTimers[id]; exists {
		timer.Stop()
		delete(tm.disconnectTimers, id)
	}
	tmuxName := session.TmuxSession
	tm.mu.Unlock()

	// Signal read goroutine to stop
	close(session.done)

	// Close PTY (sends SIGHUP to the tmux attach process)
	session.ptmx.Close()

	// Wait for process to exit (with timeout)
	doneCh := make(chan error, 1)
	go func() { doneCh <- session.cmd.Wait() }()
	select {
	case <-doneCh:
	case <-time.After(2 * time.Second):
		session.cmd.Process.Kill()
	}

	// Kill the tmux session so it doesn't linger
	if tmuxName != "" {
		tmuxKillSession(tmuxName)
	}

	log.Printf("[Terminal] Session %s closed (tmux %s killed)", id, tmuxName)
	return nil
}

// DisconnectSession detaches the PTY from a terminal without killing the
// tmux session. This allows the client to reconnect later.
func (tm *TerminalManager) DisconnectSession(id string) error {
	tm.mu.Lock()
	session, ok := tm.sessions[id]
	if !ok {
		tm.mu.Unlock()
		return fmt.Errorf("session %s not found", id)
	}
	delete(tm.sessions, id)
	if timer, exists := tm.disconnectTimers[id]; exists {
		timer.Stop()
		delete(tm.disconnectTimers, id)
	}
	tm.mu.Unlock()

	// Signal read goroutine to stop
	close(session.done)

	// Close PTY — the tmux session stays alive
	session.ptmx.Close()

	doneCh := make(chan error, 1)
	go func() { doneCh <- session.cmd.Wait() }()
	select {
	case <-doneCh:
	case <-time.After(2 * time.Second):
		session.cmd.Process.Kill()
	}

	log.Printf("[Terminal] Session %s disconnected (tmux %s still alive)", id, session.TmuxSession)
	return nil
}

// AddClient subscribes a client to a session's output.
// If a grace-period timer is pending (no subscribers), it is cancelled.
func (tm *TerminalManager) AddClient(sessionID string, client interface{}) {
	tm.mu.RLock()
	session, ok := tm.sessions[sessionID]
	tm.mu.RUnlock()
	if !ok {
		return
	}
	session.mu.Lock()
	session.clients[client] = true
	session.mu.Unlock()

	tm.cancelGraceTimer(sessionID)
}

// RemoveClient unsubscribes a client from a session's output.
// If the session has zero subscribers after removal, a 30-second grace timer
// starts. If no one reconnects before it fires, the PTY is killed.
func (tm *TerminalManager) RemoveClient(sessionID string, client interface{}) {
	tm.mu.RLock()
	session, ok := tm.sessions[sessionID]
	tm.mu.RUnlock()
	if !ok {
		return
	}
	session.mu.Lock()
	delete(session.clients, client)
	remaining := len(session.clients)
	session.mu.Unlock()

	if remaining == 0 {
		tm.startGraceTimer(sessionID)
	}
}

// GetClients returns all subscribed clients for a session
func (tm *TerminalManager) GetClients(sessionID string) []interface{} {
	tm.mu.RLock()
	session, ok := tm.sessions[sessionID]
	tm.mu.RUnlock()
	if !ok {
		return nil
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	clients := make([]interface{}, 0, len(session.clients))
	for c := range session.clients {
		clients = append(clients, c)
	}
	return clients
}

// RemoveAllClientSessions removes a client from all sessions it's subscribed to.
// For any session that drops to zero subscribers, a 30-second grace timer starts.
func (tm *TerminalManager) RemoveAllClientSessions(client interface{}) {
	tm.mu.RLock()
	type sessionInfo struct {
		session *TerminalSession
		id      string
	}
	infos := make([]sessionInfo, 0, len(tm.sessions))
	for id, s := range tm.sessions {
		infos = append(infos, sessionInfo{session: s, id: id})
	}
	tm.mu.RUnlock()

	for _, info := range infos {
		info.session.mu.Lock()
		delete(info.session.clients, client)
		remaining := len(info.session.clients)
		info.session.mu.Unlock()

		if remaining == 0 {
			tm.startGraceTimer(info.id)
		}
	}
}

// gracePeriod is the time to wait before killing a PTY with no subscribers.
const gracePeriod = 30 * time.Second

// startGraceTimer begins a countdown for a session with zero subscribers.
// When the timer fires, if the session still has zero subscribers, CloseSession
// is called. The caller must NOT hold tm.mu.
func (tm *TerminalManager) startGraceTimer(sessionID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	// If a timer already exists for this session, leave it running.
	if _, exists := tm.disconnectTimers[sessionID]; exists {
		return
	}

	log.Printf("[Terminal] Session %s has 0 subscribers, starting %v grace timer", sessionID, gracePeriod)

	tm.disconnectTimers[sessionID] = time.AfterFunc(gracePeriod, func() {
		// Timer fired -- check if the session still has zero subscribers.
		tm.mu.RLock()
		session, ok := tm.sessions[sessionID]
		tm.mu.RUnlock()
		if !ok {
			// Session already gone (manually closed or process exited).
			tm.mu.Lock()
			delete(tm.disconnectTimers, sessionID)
			tm.mu.Unlock()
			return
		}

		session.mu.Lock()
		count := len(session.clients)
		session.mu.Unlock()

		if count > 0 {
			// Someone reconnected in the meantime -- do nothing.
			tm.mu.Lock()
			delete(tm.disconnectTimers, sessionID)
			tm.mu.Unlock()
			return
		}

		// Still zero subscribers -- disconnect (keep tmux alive) rather than close.
		tm.mu.Lock()
		delete(tm.disconnectTimers, sessionID)
		tm.mu.Unlock()

		log.Printf("[Terminal] Grace period expired for session %s, disconnecting PTY (tmux stays alive)", sessionID)
		if err := tm.DisconnectSession(sessionID); err != nil {
			log.Printf("[Terminal] Failed to disconnect session %s after grace period: %v", sessionID, err)
		}
		// Do NOT call closedFunc — the tmux session is still alive and can be reconnected.
	})
}

// cancelGraceTimer stops the grace-period timer for a session, if one is
// running. The caller must NOT hold tm.mu.
func (tm *TerminalManager) cancelGraceTimer(sessionID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if timer, exists := tm.disconnectTimers[sessionID]; exists {
		timer.Stop()
		delete(tm.disconnectTimers, sessionID)
		log.Printf("[Terminal] Grace timer cancelled for session %s (subscriber reconnected)", sessionID)
	}
}

// Shutdown stops all grace-period timers, closes every active PTY session, and
// kills all mt-* tmux sessions (including orphans from previous runs).
func (tm *TerminalManager) Shutdown() {
	tm.mu.Lock()
	// Cancel all pending timers first.
	for id, timer := range tm.disconnectTimers {
		timer.Stop()
		delete(tm.disconnectTimers, id)
	}
	// Collect session IDs to close (can't call CloseSession while holding mu).
	ids := make([]string, 0, len(tm.sessions))
	for id := range tm.sessions {
		ids = append(ids, id)
	}
	tm.mu.Unlock()

	for _, id := range ids {
		if err := tm.CloseSession(id); err != nil {
			log.Printf("[Terminal] Shutdown: failed to close session %s: %v", id, err)
		}
	}

	// Also kill any orphaned mt-* tmux sessions
	orphans := tm.ListOrphanedTmuxSessions()
	for _, name := range orphans {
		tmuxKillSession(name)
	}

	log.Printf("[Terminal] Shutdown complete, closed %d active + %d orphan sessions", len(ids), len(orphans))
}

// ScanOrphanedSessions scans for mt-* tmux sessions that exist without an
// active PTY attachment. Called on backend startup to log available sessions.
func (tm *TerminalManager) ScanOrphanedSessions() {
	orphans := tm.ListOrphanedTmuxSessions()
	if len(orphans) > 0 {
		log.Printf("[Terminal] Found %d orphaned mt-* tmux sessions: %v", len(orphans), orphans)
		log.Printf("[Terminal] These can be reconnected to by the frontend")
	}
}

// ListSessions returns info about all active sessions
func (tm *TerminalManager) ListSessions() []TerminalSession {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	result := make([]TerminalSession, 0, len(tm.sessions))
	for _, s := range tm.sessions {
		result = append(result, TerminalSession{
			ID:          s.ID,
			TmuxSession: s.TmuxSession,
			Cwd:         s.Cwd,
			Cols:        s.Cols,
			Rows:        s.Rows,
			CreatedAt:   s.CreatedAt,
		})
	}
	return result
}

// ListOrphanedTmuxSessions returns mt-* tmux sessions that have no active
// PTY attachment in the manager. These are sessions that survived a backend
// restart or WebSocket disconnect.
func (tm *TerminalManager) ListOrphanedTmuxSessions() []string {
	cmd := tmuxCmd("list-sessions", "-F", "#{session_name}")
	out, err := cmd.Output()
	if err != nil {
		// No tmux server running or no sessions — that's fine.
		return nil
	}

	tm.mu.RLock()
	defer tm.mu.RUnlock()

	var orphans []string
	for _, name := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		// Only consider sessions with our prefix
		if !strings.HasPrefix(name, "mt-") {
			continue
		}
		// Check if we already have an active PTY for this
		if _, active := tm.sessions[name]; !active {
			orphans = append(orphans, name)
		}
	}
	return orphans
}

// --- Profile management ---

// TerminalProfile represents a saved terminal profile
type TerminalProfile struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Command string `json:"command,omitempty"`
	Cwd     string `json:"cwd,omitempty"`
}

func profilesPath() string {
	dataDir := os.Getenv("XDG_DATA_HOME")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".local", "share")
	}
	return filepath.Join(dataDir, "markdown-themes", "terminal-profiles.json")
}

// LoadProfiles reads saved terminal profiles
func LoadProfiles() ([]TerminalProfile, error) {
	data, err := os.ReadFile(profilesPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []TerminalProfile{
				{ID: "default-shell", Name: "Shell", Cwd: "{{workspace}}"},
			}, nil
		}
		return nil, err
	}
	var profiles []TerminalProfile
	if err := json.Unmarshal(data, &profiles); err != nil {
		return nil, err
	}
	return profiles, nil
}

// SaveProfiles writes terminal profiles to disk
func SaveProfiles(profiles []TerminalProfile) error {
	path := profilesPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// --- HTTP Handlers ---

// TerminalList returns active terminal sessions and orphaned tmux sessions
func TerminalList(w http.ResponseWriter, r *http.Request) {
	tm := GetTerminalManager()
	active := tm.ListSessions()
	orphans := tm.ListOrphanedTmuxSessions()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"active":  active,
		"orphans": orphans,
	})
}

// TerminalProfiles returns saved profiles
func TerminalProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := LoadProfiles()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(profiles)
}

// SaveTerminalProfile saves terminal profiles
func SaveTerminalProfile(w http.ResponseWriter, r *http.Request) {
	var profiles []TerminalProfile
	if err := json.NewDecoder(r.Body).Decode(&profiles); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := SaveProfiles(profiles); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// HandleTerminalMessage processes WebSocket terminal messages
func HandleTerminalMessage(msgType string, raw json.RawMessage, clientSend func(interface{}), client interface{}) {
	tm := GetTerminalManager()

	var msg struct {
		TerminalID  string `json:"terminalId"`
		Cwd         string `json:"cwd,omitempty"`
		Command     string `json:"command,omitempty"`
		Data        string `json:"data,omitempty"`
		Cols        int    `json:"cols,omitempty"`
		Rows        int    `json:"rows,omitempty"`
		RequestID   string `json:"requestId,omitempty"`
		ProfileName string `json:"profileName,omitempty"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		log.Printf("[Terminal] Failed to parse message: %v", err)
		return
	}

	switch msgType {
	case "terminal-spawn":
		cols := uint16(msg.Cols)
		rows := uint16(msg.Rows)

		// Two-layer spawn deduplication:
		// 1. requestId — catches identical retry of the same request (React StrictMode, reconnect)
		// 2. spawnKey  — catches semantically identical spawns with different IDs (rapid clicks)
		spawnKey := msg.ProfileName + "_" + msg.Cwd
		if err := tm.CheckSpawnDedup(msg.RequestID, spawnKey); err != nil {
			log.Printf("[Terminal] Spawn rejected (dedup): %v", err)
			clientSend(map[string]interface{}{
				"type":       "terminal-error",
				"terminalId": msg.TerminalID,
				"error":      "duplicate spawn rejected: " + err.Error(),
			})
			return
		}

		session, err := tm.SpawnSession(msg.TerminalID, msg.Cwd, cols, rows, msg.Command)
		if err != nil {
			clientSend(map[string]interface{}{
				"type":       "terminal-error",
				"terminalId": msg.TerminalID,
				"error":      err.Error(),
			})
			return
		}

		tm.AddClient(session.ID, client)

		clientSend(map[string]interface{}{
			"type":        "terminal-spawned",
			"terminalId":  session.ID,
			"tmuxSession": session.TmuxSession,
			"cwd":         session.Cwd,
			"cols":        session.Cols,
			"rows":        session.Rows,
		})

	case "terminal-reconnect":
		// Reconnect to an existing tmux session. The tmux session name is the
		// terminal ID (mt-{profile}-{uuid}), which the frontend persists.
		tmuxName := msg.TerminalID // tmux session name == terminal ID
		if tmuxName == "" {
			clientSend(map[string]interface{}{
				"type":       "terminal-error",
				"terminalId": msg.TerminalID,
				"error":      "missing terminalId for reconnect",
			})
			return
		}

		// Verify the tmux session exists
		if !tmuxHasSession(tmuxName) {
			clientSend(map[string]interface{}{
				"type":       "terminal-error",
				"terminalId": msg.TerminalID,
				"error":      "tmux session not found: " + tmuxName,
			})
			return
		}

		cols := uint16(msg.Cols)
		rows := uint16(msg.Rows)
		session, err := tm.ReconnectSession(msg.TerminalID, tmuxName, cols, rows)
		if err != nil {
			clientSend(map[string]interface{}{
				"type":       "terminal-error",
				"terminalId": msg.TerminalID,
				"error":      err.Error(),
			})
			return
		}

		tm.AddClient(session.ID, client)

		clientSend(map[string]interface{}{
			"type":        "terminal-spawned",
			"terminalId":  session.ID,
			"tmuxSession": session.TmuxSession,
			"cwd":         session.Cwd,
			"cols":        session.Cols,
			"rows":        session.Rows,
			"reconnected": true,
		})

	case "terminal-disconnect":
		// Graceful disconnect: close PTY but keep tmux session alive.
		tm.RemoveClient(msg.TerminalID, client)
		if err := tm.DisconnectSession(msg.TerminalID); err != nil {
			// Not an error if session doesn't exist (already disconnected)
			log.Printf("[Terminal] Disconnect note: %v", err)
		}

	case "terminal-input":
		data, err := base64.StdEncoding.DecodeString(msg.Data)
		if err != nil {
			log.Printf("[Terminal] Failed to decode input: %v", err)
			return
		}
		if err := tm.WriteToSession(msg.TerminalID, data); err != nil {
			log.Printf("[Terminal] Write error: %v", err)
		}

	case "terminal-resize":
		if err := tm.ResizeSession(msg.TerminalID, uint16(msg.Cols), uint16(msg.Rows)); err != nil {
			log.Printf("[Terminal] Resize error: %v", err)
		}

	case "terminal-close":
		// DESTRUCTIVE: kills PTY AND tmux session
		tm.RemoveClient(msg.TerminalID, client)
		if err := tm.CloseSession(msg.TerminalID); err != nil {
			log.Printf("[Terminal] Close error: %v", err)
		}

	case "terminal-list":
		active := tm.ListSessions()
		orphans := tm.ListOrphanedTmuxSessions()
		clientSend(map[string]interface{}{
			"type":    "terminal-list",
			"active":  active,
			"orphans": orphans,
		})
	}
}
