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

// Chat handles POST /api/chat - spawn Claude CLI and stream SSE response
func Chat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "invalid request: %s"}`, err.Error()), http.StatusBadRequest)
		return
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

	defer func() {
		processMu.Lock()
		delete(activeProcesses, convID)
		processMu.Unlock()
	}()

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

	// Send initial event with conversation ID
	writeSSE(w, flusher, map[string]interface{}{
		"type":           "start",
		"conversationId": convID,
	})

	// Capture stderr in background
	var stderrOutput strings.Builder
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			stderrOutput.WriteString(scanner.Text())
			stderrOutput.WriteString("\n")
		}
	}()

	// Stream stdout as SSE events
	// Claude's stream-json outputs one JSON object per line
	scanner := bufio.NewScanner(stdout)
	// Increase scanner buffer for large outputs
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	var claudeSessionID string
	var accumulatedContent string

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
			// Verbose mode: extract text from message.content[].text
			message, ok := event["message"].(map[string]interface{})
			if !ok {
				continue
			}
			// Extract session ID
			if sid, ok := event["session_id"].(string); ok && sid != "" {
				claudeSessionID = sid
			}
			// Extract content array
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
						writeSSE(w, flusher, map[string]interface{}{
							"type":    "content",
							"content": text,
							"done":    false,
						})
					}
				} else if blockType == "tool_use" {
					toolName, _ := blockMap["name"].(string)
					toolID, _ := blockMap["id"].(string)
					writeSSE(w, flusher, map[string]interface{}{
						"type": "tool_start",
						"tool": map[string]interface{}{
							"name": toolName,
							"id":   toolID,
						},
					})
				}
			}

		case "content_block_delta":
			// Non-verbose mode: extract text delta
			delta, ok := event["delta"].(map[string]interface{})
			if !ok {
				continue
			}
			deltaType, _ := delta["type"].(string)
			if deltaType == "text_delta" {
				text, _ := delta["text"].(string)
				accumulatedContent += text
				writeSSE(w, flusher, map[string]interface{}{
					"type":    "content",
					"content": text,
					"done":    false,
				})
			}

		case "content_block_start":
			// Check for tool use
			contentBlock, ok := event["content_block"].(map[string]interface{})
			if ok {
				blockType, _ := contentBlock["type"].(string)
				if blockType == "tool_use" {
					toolName, _ := contentBlock["name"].(string)
					toolID, _ := contentBlock["id"].(string)
					writeSSE(w, flusher, map[string]interface{}{
						"type": "tool_start",
						"tool": map[string]interface{}{
							"name": toolName,
							"id":   toolID,
						},
					})
				}
			}

		case "content_block_stop":
			// Could signal end of a tool use block
			writeSSE(w, flusher, map[string]interface{}{
				"type": "tool_end",
			})

		case "message_start":
			// Extract session ID from message metadata if available
			message, ok := event["message"].(map[string]interface{})
			if ok {
				if sid, ok := message["id"].(string); ok {
					claudeSessionID = sid
				}
			}

		case "message_stop":
			// Extract usage info
			usage, _ := event["usage"].(map[string]interface{})

			// Also check for session_id at the top level
			if sid, ok := event["session_id"].(string); ok && sid != "" {
				claudeSessionID = sid
			}

			writeSSE(w, flusher, map[string]interface{}{
				"type":           "done",
				"done":           true,
				"content":        accumulatedContent,
				"usage":          usage,
				"claudeSessionId": claudeSessionID,
				"conversationId": convID,
			})

		case "result":
			// Claude CLI stream-json result event (final)
			if sid, ok := event["session_id"].(string); ok && sid != "" {
				claudeSessionID = sid
			}

			// Extract cost/usage from result
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

			writeSSE(w, flusher, map[string]interface{}{
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

		// Check if client disconnected
		select {
		case <-r.Context().Done():
			log.Printf("[Chat] Client disconnected, killing process")
			cmd.Process.Kill()
			return
		default:
		}
	}

	// Wait for process to finish
	if err := cmd.Wait(); err != nil {
		errMsg := stderrOutput.String()
		if errMsg == "" {
			errMsg = err.Error()
		}
		log.Printf("[Chat] Claude process exited with error: %s (stderr: %s)", err, errMsg)

		// Send error event if the connection is still alive
		writeSSE(w, flusher, map[string]interface{}{
			"type":  "error",
			"error": strings.TrimSpace(errMsg),
			"done":  true,
		})
	}

	log.Printf("[Chat] Stream complete for conversation %s", convID)
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

// writeSSE writes an SSE event to the response
func writeSSE(w http.ResponseWriter, flusher http.Flusher, data interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("[SSE] Failed to marshal data: %v", err)
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", jsonData)
	flusher.Flush()
}
