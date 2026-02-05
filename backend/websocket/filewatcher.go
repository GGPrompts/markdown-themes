package websocket

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"markdown-themes-backend/utils"
)

// FileWatcher manages file system watching
type FileWatcher struct {
	hub     *Hub
	watcher *fsnotify.Watcher

	// File watches: path -> clients watching this file
	fileWatches map[string]map[*Client]bool
	// Track last change time per file for streaming detection
	lastChangeTime map[string]time.Time

	// Workspace watches: path -> clients watching this workspace
	workspaceWatches map[string]map[*Client]bool
	// Track watched workspace directories (recursive)
	watchedDirs map[string]string // dir -> workspace root

	mu sync.RWMutex
}

// NewFileWatcher creates a new file watcher
func NewFileWatcher(hub *Hub) *FileWatcher {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatalf("Failed to create file watcher: %v", err)
	}

	fw := &FileWatcher{
		hub:              hub,
		watcher:          watcher,
		fileWatches:      make(map[string]map[*Client]bool),
		lastChangeTime:   make(map[string]time.Time),
		workspaceWatches: make(map[string]map[*Client]bool),
		watchedDirs:      make(map[string]string),
	}

	go fw.run()
	return fw
}

func (fw *FileWatcher) run() {
	for {
		select {
		case event, ok := <-fw.watcher.Events:
			if !ok {
				return
			}
			fw.handleEvent(event)

		case err, ok := <-fw.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("[FileWatcher] Error: %v", err)
		}
	}
}

func (fw *FileWatcher) handleEvent(event fsnotify.Event) {
	path := event.Name

	// Handle file-specific watches
	fw.mu.RLock()
	clients, hasFileWatch := fw.fileWatches[path]
	fw.mu.RUnlock()

	if hasFileWatch && (event.Op&fsnotify.Write != 0 || event.Op&fsnotify.Remove != 0) {
		fw.handleFileChange(path, clients, event.Op)
	}

	// Handle workspace watches
	fw.mu.RLock()
	workspaceRoot, isInWorkspace := fw.watchedDirs[filepath.Dir(path)]
	fw.mu.RUnlock()

	if isInWorkspace && (event.Op&fsnotify.Write != 0 || event.Op&fsnotify.Create != 0) {
		// Skip non-relevant files
		ext := strings.ToLower(filepath.Ext(path))
		if isWatchableFile(ext) {
			fw.handleWorkspaceChange(path, workspaceRoot)
		}
	}

	// Handle new directories being created in watched workspaces
	if event.Op&fsnotify.Create != 0 {
		fw.mu.RLock()
		wsRoot, isInWs := fw.watchedDirs[filepath.Dir(path)]
		fw.mu.RUnlock()

		if isInWs {
			info, err := os.Stat(path)
			if err == nil && info.IsDir() && !utils.ShouldIgnoreDir(info.Name()) {
				fw.addDirToWatcher(path, wsRoot)
			}
		}
	}
}

func isWatchableFile(ext string) bool {
	watchableExts := map[string]bool{
		".md": true, ".mdx": true, ".txt": true,
		".ts": true, ".tsx": true, ".js": true, ".jsx": true,
		".go": true, ".py": true, ".rs": true, ".rb": true,
		".java": true, ".c": true, ".cpp": true, ".h": true,
		".json": true, ".yaml": true, ".yml": true, ".toml": true,
		".css": true, ".scss": true, ".html": true,
		".prompty": true,
	}
	return watchableExts[ext]
}

func (fw *FileWatcher) handleFileChange(path string, clients map[*Client]bool, op fsnotify.Op) {
	if op&fsnotify.Remove != 0 {
		// File deleted - but wait briefly for atomic writes (editors often delete then recreate)
		go func() {
			time.Sleep(100 * time.Millisecond)

			// Check if file came back (atomic write)
			if _, err := os.Stat(path); err == nil {
				// File exists again, treat as a write instead
				fw.handleFileChange(path, clients, fsnotify.Write)
				return
			}

			// File is really gone
			for client := range clients {
				fw.hub.SendToClient(client, map[string]interface{}{
					"type": "file-deleted",
					"path": path,
				})
			}
		}()
		return
	}

	// File modified - read content
	content, err := os.ReadFile(path)
	if err != nil {
		log.Printf("[FileWatcher] Error reading file %s: %v", path, err)
		return
	}

	info, err := os.Stat(path)
	if err != nil {
		return
	}

	// Calculate time since last change
	fw.mu.Lock()
	lastChange := fw.lastChangeTime[path]
	now := time.Now()
	timeSinceLastChange := int64(0)
	if !lastChange.IsZero() {
		timeSinceLastChange = now.Sub(lastChange).Milliseconds()
	}
	fw.lastChangeTime[path] = now
	fw.mu.Unlock()

	// Send to all watching clients
	message := map[string]interface{}{
		"type":                "file-change",
		"path":                path,
		"content":             string(content),
		"modified":            info.ModTime().Format(time.RFC3339),
		"size":                info.Size(),
		"timestamp":           now.UnixMilli(),
		"timeSinceLastChange": timeSinceLastChange,
	}

	for client := range clients {
		fw.hub.SendToClient(client, message)
	}
}

func (fw *FileWatcher) handleWorkspaceChange(path string, workspaceRoot string) {
	fw.mu.RLock()
	clients, ok := fw.workspaceWatches[workspaceRoot]
	if !ok {
		fw.mu.RUnlock()
		return
	}

	// Calculate time since last change for this file
	lastChange := fw.lastChangeTime[path]
	now := time.Now()
	timeSinceLastChange := int64(0)
	if !lastChange.IsZero() {
		timeSinceLastChange = now.Sub(lastChange).Milliseconds()
	}
	fw.mu.RUnlock()

	// Update last change time
	fw.mu.Lock()
	fw.lastChangeTime[path] = now
	fw.mu.Unlock()

	// Only notify on first change or if streaming (rapid changes)
	// This matches TabzChrome behavior
	if timeSinceLastChange > 0 && timeSinceLastChange > 1500 {
		// Not streaming, don't spam notifications
		// But still notify on first change (timeSinceLastChange == 0)
		return
	}

	message := map[string]interface{}{
		"type":                "workspace-file-change",
		"path":                path,
		"timeSinceLastChange": timeSinceLastChange,
	}

	for client := range clients {
		fw.hub.SendToClient(client, message)
	}
}

// AddFileWatch adds a file watch for a client
func (fw *FileWatcher) AddFileWatch(path string, client *Client) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	// Create client set if needed
	if fw.fileWatches[path] == nil {
		fw.fileWatches[path] = make(map[*Client]bool)

		// Add to fsnotify watcher
		if err := fw.watcher.Add(path); err != nil {
			log.Printf("[FileWatcher] Error watching file %s: %v", path, err)
			fw.hub.SendToClient(client, map[string]interface{}{
				"type":  "file-watch-error",
				"path":  path,
				"error": err.Error(),
			})
			return
		}
	}

	fw.fileWatches[path][client] = true

	// Send initial content
	go fw.sendInitialContent(path, client)
}

func (fw *FileWatcher) sendInitialContent(path string, client *Client) {
	content, err := os.ReadFile(path)
	if err != nil {
		fw.hub.SendToClient(client, map[string]interface{}{
			"type":  "file-watch-error",
			"path":  path,
			"error": err.Error(),
		})
		return
	}

	info, err := os.Stat(path)
	if err != nil {
		fw.hub.SendToClient(client, map[string]interface{}{
			"type":  "file-watch-error",
			"path":  path,
			"error": err.Error(),
		})
		return
	}

	fw.hub.SendToClient(client, map[string]interface{}{
		"type":     "file-content",
		"path":     path,
		"content":  string(content),
		"modified": info.ModTime().Format(time.RFC3339),
		"size":     info.Size(),
	})
}

// RemoveFileWatch removes a file watch for a client
func (fw *FileWatcher) RemoveFileWatch(path string, client *Client) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	if clients, ok := fw.fileWatches[path]; ok {
		delete(clients, client)

		// If no more clients watching, remove from watcher
		if len(clients) == 0 {
			fw.watcher.Remove(path)
			delete(fw.fileWatches, path)
			delete(fw.lastChangeTime, path)
		}
	}
}

// AddWorkspaceWatch adds a workspace watch for a client
func (fw *FileWatcher) AddWorkspaceWatch(path string, client *Client) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	// Create client set if needed
	if fw.workspaceWatches[path] == nil {
		fw.workspaceWatches[path] = make(map[*Client]bool)

		// Walk directory and add all subdirs to watcher
		go fw.watchWorkspaceRecursive(path)
	}

	fw.workspaceWatches[path][client] = true
	log.Printf("[FileWatcher] Added workspace watch: %s", path)
}

func (fw *FileWatcher) watchWorkspaceRecursive(root string) {
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Continue on error
		}

		if info.IsDir() {
			// Skip ignored directories
			if utils.ShouldIgnoreDir(info.Name()) && path != root {
				return filepath.SkipDir
			}

			fw.addDirToWatcher(path, root)
		}
		return nil
	})
}

func (fw *FileWatcher) addDirToWatcher(dir, workspaceRoot string) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	if _, exists := fw.watchedDirs[dir]; exists {
		return
	}

	if err := fw.watcher.Add(dir); err != nil {
		log.Printf("[FileWatcher] Error watching dir %s: %v", dir, err)
		return
	}

	fw.watchedDirs[dir] = workspaceRoot
}

// RemoveWorkspaceWatch removes a workspace watch for a client
func (fw *FileWatcher) RemoveWorkspaceWatch(path string, client *Client) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	if clients, ok := fw.workspaceWatches[path]; ok {
		delete(clients, client)

		// If no more clients watching, remove from watcher
		if len(clients) == 0 {
			// Remove all directories associated with this workspace
			for dir, root := range fw.watchedDirs {
				if root == path {
					fw.watcher.Remove(dir)
					delete(fw.watchedDirs, dir)
				}
			}
			delete(fw.workspaceWatches, path)
		}
	}
}
