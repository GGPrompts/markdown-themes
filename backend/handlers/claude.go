package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"markdown-themes-backend/models"
)

// ClaudeSession handles GET /api/claude/session - find active Claude sessions
// Scans ~/.claude/projects/ for recently modified conversation .jsonl files
func ClaudeSession(w http.ResponseWriter, r *http.Request) {
	home, err := os.UserHomeDir()
	if err != nil {
		http.Error(w, `{"error": "cannot determine home directory"}`, http.StatusInternalServerError)
		return
	}

	claudeProjectsDir := filepath.Join(home, ".claude", "projects")

	// Check if .claude/projects exists
	if _, err := os.Stat(claudeProjectsDir); os.IsNotExist(err) {
		http.Error(w, `{"error": "no Claude projects directory found"}`, http.StatusNotFound)
		return
	}

	// Find the most recently modified .jsonl conversation file
	var bestSession *models.ClaudeSessionInfo
	var bestModTime time.Time

	// Walk through project directories
	projectEntries, err := os.ReadDir(claudeProjectsDir)
	if err != nil {
		http.Error(w, `{"error": "cannot read Claude projects directory"}`, http.StatusInternalServerError)
		return
	}

	for _, projectEntry := range projectEntries {
		if !projectEntry.IsDir() {
			continue
		}

		projectDir := filepath.Join(claudeProjectsDir, projectEntry.Name())

		// Look for .jsonl files directly in the project directory
		// Claude Code stores conversations as {sessionId}.jsonl
		entries, err := os.ReadDir(projectDir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
				continue
			}

			filePath := filepath.Join(projectDir, entry.Name())
			info, err := entry.Info()
			if err != nil {
				continue
			}

			modTime := info.ModTime()

			// Only consider files modified in the last 30 minutes as potentially active
			if time.Since(modTime) > 30*time.Minute {
				continue
			}

			if bestSession == nil || modTime.After(bestModTime) {
				sessionID := strings.TrimSuffix(entry.Name(), ".jsonl")
				workingDir := decodeProjectPath(projectEntry.Name())

				bestSession = &models.ClaudeSessionInfo{
					SessionID:        sessionID,
					WorkingDir:       workingDir,
					ConversationPath: filePath,
					Pane:             "",
					Status:           "active",
				}
				bestModTime = modTime
			}
		}
	}

	if bestSession == nil {
		http.Error(w, `{"error": "no active Claude session found"}`, http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(bestSession)
}

// ClaudeSessionByID handles GET /api/claude/session/{sessionId} - find a specific session's JSONL file
func ClaudeSessionByID(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	if sessionID == "" {
		http.Error(w, `{"error": "sessionId required"}`, http.StatusBadRequest)
		return
	}

	home, err := os.UserHomeDir()
	if err != nil {
		http.Error(w, `{"error": "cannot determine home directory"}`, http.StatusInternalServerError)
		return
	}

	claudeProjectsDir := filepath.Join(home, ".claude", "projects")
	targetFile := sessionID + ".jsonl"

	// Scan all project directories for the JSONL file
	projectEntries, err := os.ReadDir(claudeProjectsDir)
	if err != nil {
		http.Error(w, `{"error": "cannot read Claude projects directory"}`, http.StatusNotFound)
		return
	}

	for _, projectEntry := range projectEntries {
		if !projectEntry.IsDir() {
			continue
		}

		filePath := filepath.Join(claudeProjectsDir, projectEntry.Name(), targetFile)
		if _, err := os.Stat(filePath); err == nil {
			workingDir := decodeProjectPath(projectEntry.Name())
			session := models.ClaudeSessionInfo{
				SessionID:        sessionID,
				WorkingDir:       workingDir,
				ConversationPath: filePath,
				Pane:             "",
				Status:           "found",
			}
			json.NewEncoder(w).Encode(session)
			return
		}
	}

	http.Error(w, `{"error": "session not found"}`, http.StatusNotFound)
}

// decodeProjectPath converts the encoded directory name back to a filesystem path.
// e.g., "-home-user-projects-myapp" -> "/home/user/projects/myapp"
func decodeProjectPath(encoded string) string {
	// The encoding replaces leading / with nothing and all / with -
	// So "-home-user-projects-myapp" came from "/home/user/projects/myapp"
	// We restore by adding leading / and replacing - with /
	// But this is ambiguous (directory names can contain hyphens)
	// Best effort: replace leading dash with / and subsequent dashes with /
	if strings.HasPrefix(encoded, "-") {
		return "/" + strings.Replace(encoded[1:], "-", "/", -1)
	}
	return "/" + strings.Replace(encoded, "-", "/", -1)
}
