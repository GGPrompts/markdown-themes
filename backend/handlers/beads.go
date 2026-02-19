package handlers

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// BeadsIssue represents a single issue from .beads/issues.jsonl
type BeadsIssue struct {
	ID           string            `json:"id"`
	Title        string            `json:"title"`
	Description  string            `json:"description,omitempty"`
	Notes        string            `json:"notes,omitempty"`
	Design       string            `json:"design,omitempty"`
	Status       string            `json:"status"`
	Priority     int               `json:"priority"`
	IssueType    string            `json:"issue_type,omitempty"`
	Owner        string            `json:"owner,omitempty"`
	Labels       []string          `json:"labels,omitempty"`
	Dependencies []BeadsDependency `json:"dependencies,omitempty"`
	CreatedAt    string            `json:"created_at,omitempty"`
	UpdatedAt    string            `json:"updated_at,omitempty"`
	ClosedAt     string            `json:"closed_at,omitempty"`
	CloseReason  string            `json:"close_reason,omitempty"`
}

// BeadsDependency represents a dependency between issues
type BeadsDependency struct {
	IssueID     string `json:"issue_id"`
	DependsOnID string `json:"depends_on_id"`
	Type        string `json:"type"`
	CreatedAt   string `json:"created_at,omitempty"`
}

// BeadsIssues handles GET /api/beads/issues
func BeadsIssues(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, `{"error": "path parameter required"}`, http.StatusBadRequest)
		return
	}

	// Expand home directory
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			path = filepath.Join(home, path[1:])
		}
	}

	jsonlPath := filepath.Join(filepath.Clean(path), ".beads", "issues.jsonl")

	f, err := os.Open(jsonlPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"issues": []BeadsIssue{},
			"count":  0,
		})
		return
	}
	defer f.Close()

	var issues []BeadsIssue
	scanner := bufio.NewScanner(f)
	// JSONL lines can be large (long descriptions/notes)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var issue BeadsIssue
		if err := json.Unmarshal([]byte(line), &issue); err != nil {
			continue
		}
		issues = append(issues, issue)
	}

	// Sort by created_at descending (newest first)
	sort.Slice(issues, func(i, j int) bool {
		return issues[i].CreatedAt > issues[j].CreatedAt
	})

	if issues == nil {
		issues = []BeadsIssue{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"issues": issues,
		"count":  len(issues),
	})
}
