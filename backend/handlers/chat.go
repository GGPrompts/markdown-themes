package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ChatRequest represents the incoming chat request
type ChatRequest struct {
	Messages           []ChatMessage `json:"messages"`
	ConversationID     string        `json:"conversationId,omitempty"`
	ClaudeSessionID    string        `json:"claudeSessionId,omitempty"`
	Model              string        `json:"model,omitempty"`
	Cwd                string        `json:"cwd,omitempty"`
	AllowedTools       []string      `json:"allowedTools,omitempty"`
	AddDirs            []string      `json:"addDirs,omitempty"`
	PluginDirs         []string      `json:"pluginDirs,omitempty"`
	AppendSystemPrompt string        `json:"appendSystemPrompt,omitempty"`
	MaxTurns           int           `json:"maxTurns,omitempty"`
	PermissionMode     string        `json:"permissionMode,omitempty"`
	TeammateMode       string        `json:"teammateMode,omitempty"`
	Agent              string        `json:"agent,omitempty"`
	LastEventID        int64         `json:"lastEventId,omitempty"`
}

// BufferedEvent stores an SSE event with its sequential ID
type BufferedEvent struct {
	ID   int64                  `json:"id"`
	Data map[string]interface{} `json:"data"`
}

// ConversationBuffer stores SSE events for a single conversation
type ConversationBuffer struct {
	mu        sync.RWMutex
	events    []BufferedEvent
	nextID    int64
	completed bool
	expiresAt time.Time
}

const (
	maxEventsPerBuffer = 1000
	bufferExpiryAfter  = 5 * time.Minute
	bufferCleanupEvery = 1 * time.Minute
)

var (
	conversationBuffers = make(map[string]*ConversationBuffer)
	bufferMu            sync.RWMutex
	cleanupStarted      atomic.Bool
)

// getOrCreateBuffer returns an existing buffer or creates a new one for the conversation
func getOrCreateBuffer(convID string) *ConversationBuffer {
	bufferMu.Lock()
	defer bufferMu.Unlock()

	if buf, exists := conversationBuffers[convID]; exists {
		return buf
	}

	buf := &ConversationBuffer{}
	conversationBuffers[convID] = buf
	return buf
}

// resetBuffer creates a fresh buffer for the conversation, replacing any existing one
func resetBuffer(convID string) *ConversationBuffer {
	bufferMu.Lock()
	defer bufferMu.Unlock()

	buf := &ConversationBuffer{}
	conversationBuffers[convID] = buf
	return buf
}

// getBuffer returns an existing buffer (nil if not found)
func getBuffer(convID string) *ConversationBuffer {
	bufferMu.RLock()
	defer bufferMu.RUnlock()
	return conversationBuffers[convID]
}

// appendEvent adds an event to the buffer and returns the assigned event ID.
// If the buffer is at capacity, the oldest event is evicted.
func (b *ConversationBuffer) appendEvent(data map[string]interface{}) int64 {
	b.mu.Lock()
	defer b.mu.Unlock()

	id := b.nextID
	b.nextID++

	b.events = append(b.events, BufferedEvent{ID: id, Data: data})

	// Evict oldest events if over capacity
	if len(b.events) > maxEventsPerBuffer {
		b.events = b.events[len(b.events)-maxEventsPerBuffer:]
	}

	return id
}

// eventsAfter returns all buffered events with IDs strictly greater than afterID
func (b *ConversationBuffer) eventsAfter(afterID int64) []BufferedEvent {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var result []BufferedEvent
	for _, ev := range b.events {
		if ev.ID > afterID {
			result = append(result, ev)
		}
	}
	return result
}

// markCompleted marks the buffer as completed and schedules expiry
func (b *ConversationBuffer) markCompleted() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.completed = true
	b.expiresAt = time.Now().Add(bufferExpiryAfter)
}

// isExpired returns true if the buffer has completed and passed its expiry time
func (b *ConversationBuffer) isExpired() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.completed && !b.expiresAt.IsZero() && time.Now().After(b.expiresAt)
}

// startBufferCleanup starts a background goroutine that periodically removes expired buffers
func startBufferCleanup() {
	if !cleanupStarted.CompareAndSwap(false, true) {
		return // already running
	}

	go func() {
		ticker := time.NewTicker(bufferCleanupEvery)
		defer ticker.Stop()

		for range ticker.C {
			bufferMu.Lock()
			for id, buf := range conversationBuffers {
				if buf.isExpired() {
					delete(conversationBuffers, id)
					log.Printf("[ChatBuffer] Expired buffer for conversation %s", id)
				}
			}
			bufferMu.Unlock()
		}
	}()
}

// ChatMessage represents a single message in the conversation
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ActiveProcess tracks a running Claude CLI process
type ActiveProcess struct {
	Cmd            *exec.Cmd
	ConversationID string
	StartedAt      time.Time
	cancel         func()
}

var (
	activeProcesses = make(map[string]*ActiveProcess)
	processMu       sync.RWMutex
)

// Chat handles POST /api/chat - spawn Claude CLI and stream SSE response.
// Supports reconnection: if LastEventID is provided and a buffer exists
// for the conversation, buffered events are replayed before resuming the live stream.
func Chat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Start buffer cleanup goroutine (idempotent, runs once)
	startBufferCleanup()

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "invalid request: %s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	// Handle reconnection: if LastEventID is set and conversation has a buffer,
	// replay missed events and continue streaming from the live buffer
	if req.LastEventID > 0 && req.ConversationID != "" {
		if handleReconnect(w, r, req) {
			return
		}
		// If reconnect fails (no buffer/process), fall through to start a new stream
	}

	if len(req.Messages) == 0 {
		http.Error(w, `{"error": "messages array required"}`, http.StatusBadRequest)
		return
	}

	// Get the last user message to send to Claude
	var lastUserMessage string
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			lastUserMessage = req.Messages[i].Content
			break
		}
	}

	if lastUserMessage == "" {
		http.Error(w, `{"error": "no user message found"}`, http.StatusBadRequest)
		return
	}

	// Default tools safe for headless -p mode (no interactive approval)
	defaultAllowedTools := []string{
		"Read", "Write", "Edit",
		"Bash", "Glob", "Grep",
		"WebFetch", "WebSearch",
	}

	allowedTools := defaultAllowedTools
	if len(req.AllowedTools) > 0 {
		allowedTools = req.AllowedTools
	}

	// Build the Claude CLI command
	args := []string{
		"--output-format", "stream-json",
		"--verbose",
		"-p", lastUserMessage,
	}

	// Add allowed tools so Claude can actually use them in non-interactive mode
	for _, tool := range allowedTools {
		args = append(args, "--allowedTools", tool)
	}

	// Add model if explicitly specified
	if req.Model != "" {
		args = append([]string{"--model", req.Model}, args...)
	}

	// Add directories
	for _, dir := range req.AddDirs {
		args = append(args, "--add-dir", dir)
	}
	for _, dir := range req.PluginDirs {
		args = append(args, "--plugin-dir", dir)
	}

	// Add system prompt appendage
	if req.AppendSystemPrompt != "" {
		args = append(args, "--append-system-prompt", req.AppendSystemPrompt)
	}

	// Add max turns
	if req.MaxTurns > 0 {
		args = append(args, "--max-turns", fmt.Sprintf("%d", req.MaxTurns))
	}

	// Add permission mode
	if req.PermissionMode != "" {
		args = append(args, "--permission-mode", req.PermissionMode)
	}

	// Add teammate mode
	if req.TeammateMode != "" {
		args = append(args, "--teammate-mode", req.TeammateMode)
	}

	// Add agent
	if req.Agent != "" {
		args = append(args, "--agent", req.Agent)
	}

	// Add session resumption if provided
	if req.ClaudeSessionID != "" {
		args = append(args, "--resume", req.ClaudeSessionID)
	}

	cmd := exec.Command("claude", args...)

	// Set working directory if provided
	if req.Cwd != "" {
		cmd.Dir = req.Cwd
	}

	// Get stdout pipe for streaming
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "failed to create stdout pipe: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "failed to create stderr pipe: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Start the process
	if err := cmd.Start(); err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "failed to start claude: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	log.Printf("[Chat] Started Claude CLI (PID: %d)", cmd.Process.Pid)

	// Track the process
	convID := req.ConversationID
	if convID == "" {
		convID = fmt.Sprintf("conv_%d", time.Now().UnixNano())
	}

	proc := &ActiveProcess{
		Cmd:            cmd,
		ConversationID: convID,
		StartedAt:      time.Now(),
		cancel: func() {
			if cmd.Process != nil {
				cmd.Process.Kill()
			}
		},
	}

	processMu.Lock()
	activeProcesses[convID] = proc
	processMu.Unlock()

	// Create a fresh event buffer for this conversation turn.
	// Reconnects are handled above and return early, so this always starts a new stream.
	buf := resetBuffer(convID)

	// Buffer the initial start event
	buf.appendEvent(map[string]interface{}{
		"type":           "start",
		"conversationId": convID,
	})

	// Launch background goroutine to read stdout into the buffer.
	// This goroutine runs independently of the HTTP handler, so the process
	// continues buffering events even if the client disconnects.
	go func() {
		defer func() {
			processMu.Lock()
			delete(activeProcesses, convID)
			processMu.Unlock()

			// Mark buffer as completed so it expires after 5 minutes
			buf.markCompleted()
			log.Printf("[Chat] Stream complete for conversation %s", convID)
		}()

		// Capture stderr in background
		var stderrOutput strings.Builder
		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				stderrOutput.WriteString(scanner.Text())
				stderrOutput.WriteString("\n")
			}
		}()

		// Stream stdout as SSE events into the buffer
		// Claude's stream-json outputs one JSON object per line
		scanner := bufio.NewScanner(stdout)
		scanBuf := make([]byte, 0, 64*1024)
		scanner.Buffer(scanBuf, 1024*1024)

		var claudeSessionID string
		var accumulatedContent string
		var currentBlockType string // tracks "text", "thinking", "tool_use"

		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			// Parse the Claude stream-json event
			var event map[string]interface{}
			if err := json.Unmarshal([]byte(line), &event); err != nil {
				log.Printf("[Chat] Failed to parse event: %s", err)
				continue
			}

			eventType, _ := event["type"].(string)

			switch eventType {
			case "assistant":
				message, ok := event["message"].(map[string]interface{})
				if !ok {
					continue
				}
				if sid, ok := event["session_id"].(string); ok && sid != "" {
					claudeSessionID = sid
				}
				content, ok := message["content"].([]interface{})
				if !ok {
					continue
				}
				for _, block := range content {
					blockMap, ok := block.(map[string]interface{})
					if !ok {
						continue
					}
					blockType, _ := blockMap["type"].(string)
					if blockType == "text" {
						text, _ := blockMap["text"].(string)
						if text != "" {
							accumulatedContent += text
							buf.appendEvent(map[string]interface{}{
								"type":    "content",
								"content": text,
								"done":    false,
							})
						}
					} else if blockType == "thinking" {
						thinking, _ := blockMap["thinking"].(string)
						buf.appendEvent(map[string]interface{}{
							"type": "thinking_start",
						})
						if thinking != "" {
							buf.appendEvent(map[string]interface{}{
								"type":    "thinking",
								"content": thinking,
							})
						}
					} else if blockType == "tool_use" {
						toolName, _ := blockMap["name"].(string)
						toolID, _ := blockMap["id"].(string)
						buf.appendEvent(map[string]interface{}{
							"type": "tool_start",
							"tool": map[string]interface{}{
								"name": toolName,
								"id":   toolID,
							},
						})
					}
				}

			case "content_block_delta":
				delta, ok := event["delta"].(map[string]interface{})
				if !ok {
					continue
				}
				deltaType, _ := delta["type"].(string)
				if deltaType == "text_delta" {
					text, _ := delta["text"].(string)
					accumulatedContent += text
					buf.appendEvent(map[string]interface{}{
						"type":    "content",
						"content": text,
						"done":    false,
					})
				} else if deltaType == "thinking_delta" {
					thinking, _ := delta["thinking"].(string)
					if thinking != "" {
						buf.appendEvent(map[string]interface{}{
							"type":    "thinking",
							"content": thinking,
						})
					}
				} else if deltaType == "input_json_delta" {
					partialJSON, _ := delta["partial_json"].(string)
					if partialJSON != "" {
						buf.appendEvent(map[string]interface{}{
							"type":    "tool_input",
							"content": partialJSON,
						})
					}
				}

			case "content_block_start":
				contentBlock, ok := event["content_block"].(map[string]interface{})
				if ok {
					blockType, _ := contentBlock["type"].(string)
					currentBlockType = blockType
					if blockType == "tool_use" {
						toolName, _ := contentBlock["name"].(string)
						toolID, _ := contentBlock["id"].(string)
						buf.appendEvent(map[string]interface{}{
							"type": "tool_start",
							"tool": map[string]interface{}{
								"name": toolName,
								"id":   toolID,
							},
						})
					} else if blockType == "thinking" {
						buf.appendEvent(map[string]interface{}{
							"type": "thinking_start",
						})
					}
				}

			case "content_block_stop":
				if currentBlockType == "thinking" {
					buf.appendEvent(map[string]interface{}{
						"type": "thinking_end",
					})
				} else if currentBlockType == "tool_use" {
					buf.appendEvent(map[string]interface{}{
						"type": "tool_end",
					})
				}
				currentBlockType = ""

			case "message_start":
				message, ok := event["message"].(map[string]interface{})
				if ok {
					if sid, ok := message["id"].(string); ok {
						claudeSessionID = sid
					}
				}

			case "message_stop":
				usage, _ := event["usage"].(map[string]interface{})
				if sid, ok := event["session_id"].(string); ok && sid != "" {
					claudeSessionID = sid
				}
				buf.appendEvent(map[string]interface{}{
					"type":            "done",
					"done":            true,
					"content":         accumulatedContent,
					"usage":           usage,
					"claudeSessionId": claudeSessionID,
					"conversationId":  convID,
				})

			case "result":
				if sid, ok := event["session_id"].(string); ok && sid != "" {
					claudeSessionID = sid
				}
				usage, _ := event["usage"].(map[string]interface{})
				modelUsage, _ := event["modelUsage"].(map[string]interface{})
				log.Printf("[Chat] result event - modelUsage present: %v, keys: %v", modelUsage != nil, func() []string {
					keys := make([]string, 0)
					for k := range modelUsage {
						keys = append(keys, k)
					}
					return keys
				}())
				costUSD, _ := event["total_cost_usd"].(float64)
				duration, _ := event["duration_ms"].(float64)

				buf.appendEvent(map[string]interface{}{
					"type":            "done",
					"done":            true,
					"content":         accumulatedContent,
					"usage":           usage,
					"modelUsage":      modelUsage,
					"claudeSessionId": claudeSessionID,
					"conversationId":  convID,
					"costUSD":         costUSD,
					"durationMs":      duration,
				})
			}
		}

		// Wait for process to finish
		if err := cmd.Wait(); err != nil {
			errMsg := stderrOutput.String()
			if errMsg == "" {
				errMsg = err.Error()
			}
			log.Printf("[Chat] Claude process exited with error: %s (stderr: %s)", err, errMsg)

			buf.appendEvent(map[string]interface{}{
				"type":  "error",
				"error": strings.TrimSpace(errMsg),
				"done":  true,
			})
		}
	}()

	// Stream buffered events to the initial client connection.
	// The background goroutine above populates the buffer; this function
	// polls it and delivers events to the HTTP response as SSE.
	streamBufferToClient(w, r, buf)
}

// ChatProcessStatus handles GET /api/chat/process - check if a process is running
func ChatProcessStatus(w http.ResponseWriter, r *http.Request) {
	convID := r.URL.Query().Get("conversationId")

	processMu.RLock()
	defer processMu.RUnlock()

	if convID != "" {
		proc, exists := activeProcesses[convID]
		if exists {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"hasProcess":     true,
				"running":        true,
				"conversationId": proc.ConversationID,
				"startedAt":      proc.StartedAt.Format(time.RFC3339),
			})
		} else {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"hasProcess": false,
				"running":    false,
			})
		}
	} else {
		// Return all active processes
		processes := make([]map[string]interface{}, 0)
		for _, proc := range activeProcesses {
			processes = append(processes, map[string]interface{}{
				"conversationId": proc.ConversationID,
				"startedAt":      proc.StartedAt.Format(time.RFC3339),
			})
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"processes": processes,
			"count":     len(processes),
		})
	}
}

// ChatProcessKill handles DELETE /api/chat/process - kill a running process
func ChatProcessKill(w http.ResponseWriter, r *http.Request) {
	convID := r.URL.Query().Get("conversationId")
	if convID == "" {
		http.Error(w, `{"error": "conversationId parameter required"}`, http.StatusBadRequest)
		return
	}

	processMu.Lock()
	proc, exists := activeProcesses[convID]
	if exists {
		proc.cancel()
		delete(activeProcesses, convID)
	}
	processMu.Unlock()

	if exists {
		log.Printf("[Chat] Killed process for conversation %s", convID)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Process killed",
		})
	} else {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "No active process found",
		})
	}
}

// handleReconnect replays buffered events and streams any new ones for a reconnecting client.
// Returns true if reconnection was handled (caller should return), false if no buffer/process found.
func handleReconnect(w http.ResponseWriter, r *http.Request, req ChatRequest) bool {
	convID := req.ConversationID
	buf := getBuffer(convID)
	if buf == nil {
		log.Printf("[Chat] Reconnect requested but no buffer for conversation %s", convID)
		return false
	}

	log.Printf("[Chat] Reconnect for conversation %s: resuming after event ID %d", convID, req.LastEventID)
	streamBufferToClient(w, r, buf, req.LastEventID)
	return true
}

// streamBufferToClient streams events from the buffer to the HTTP response as SSE.
// It starts from afterEventID (use -1 to stream from the beginning) and polls
// for new events until the buffer is marked completed or the client disconnects.
func streamBufferToClient(w http.ResponseWriter, r *http.Request, buf *ConversationBuffer, startAfterID ...int64) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"error": "streaming not supported"}`, http.StatusInternalServerError)
		return
	}

	// Determine starting point
	var lastSeen int64 = -1
	if len(startAfterID) > 0 {
		lastSeen = startAfterID[0]
	}

	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			log.Printf("[Chat] Client disconnected while streaming from buffer")
			return
		case <-ticker.C:
			newEvents := buf.eventsAfter(lastSeen)
			for _, ev := range newEvents {
				writeSSEWithID(w, flusher, ev.ID, ev.Data)
				lastSeen = ev.ID
			}

			// Check if conversation completed
			buf.mu.RLock()
			done := buf.completed
			buf.mu.RUnlock()
			if done {
				// Drain any final events that arrived between the check and now
				finalEvents := buf.eventsAfter(lastSeen)
				for _, ev := range finalEvents {
					writeSSEWithID(w, flusher, ev.ID, ev.Data)
				}
				return
			}
		}
	}
}

// writeSSEWithID writes an SSE event with an explicit event ID to the response
func writeSSEWithID(w http.ResponseWriter, flusher http.Flusher, id int64, data interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("[SSE] Failed to marshal data: %v", err)
		return
	}
	fmt.Fprintf(w, "id: %d\ndata: %s\n\n", id, jsonData)
	flusher.Flush()
}
