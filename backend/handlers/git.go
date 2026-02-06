package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"markdown-themes-backend/models"
	"markdown-themes-backend/utils"
)

// GitRepos handles GET /api/git/repos - find git repositories in a directory
func GitRepos(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "dir parameter required",
		})
		return
	}

	// Expand home directory
	if strings.HasPrefix(dir, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			dir = filepath.Join(home, dir[1:])
		}
	}

	dir = filepath.Clean(dir)

	maxDepth := 3
	if d := r.URL.Query().Get("maxDepth"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil {
			maxDepth = parsed
		}
	}

	var repos []models.GitRepoInfo
	findGitRepos(dir, 0, maxDepth, &repos)

	// Ensure repos is never null in JSON
	if repos == nil {
		repos = []models.GitRepoInfo{}
	}

	json.NewEncoder(w).Encode(models.GitReposResponse{
		Success: true,
		Data: models.GitReposData{
			ProjectsDir: dir,
			Repos:       repos,
		},
	})
}

func findGitRepos(path string, currentDepth, maxDepth int, repos *[]models.GitRepoInfo) {
	if currentDepth > maxDepth {
		return
	}

	// Check if this is a git repo
	if utils.IsGitRepo(path) {
		repo := models.GitRepoInfo{
			Path:      path,
			Name:      filepath.Base(path),
			Branch:    utils.GetGitBranch(path),
			IsDirty:   isGitDirty(path),
			Staged:    []models.GitFile{},
			Unstaged:  []models.GitFile{},
			Untracked: []models.GitFile{},
			Worktrees: []models.GitWorktree{},
		}

		// Get remote URL and derive GitHub URL
		cmd := exec.Command("git", "-C", path, "remote", "get-url", "origin")
		if output, err := cmd.Output(); err == nil {
			repo.RemoteURL = strings.TrimSpace(string(output))
			githubURL := remoteToGithubURL(repo.RemoteURL)
			repo.GithubURL = githubURL
		}

		// Get tracking branch and ahead/behind
		cmd = exec.Command("git", "-C", path, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
		if output, err := cmd.Output(); err == nil {
			repo.Tracking = strings.TrimSpace(string(output))
		}

		if repo.Tracking != "" {
			cmd = exec.Command("git", "-C", path, "rev-list", "--left-right", "--count", "HEAD...@{u}")
			if output, err := cmd.Output(); err == nil {
				parts := strings.Fields(strings.TrimSpace(string(output)))
				if len(parts) == 2 {
					repo.Ahead, _ = strconv.Atoi(parts[0])
					repo.Behind, _ = strconv.Atoi(parts[1])
				}
			}
		}

		// Get staged, unstaged, untracked files from git status
		cmd = exec.Command("git", "-C", path, "status", "--porcelain")
		if output, err := cmd.Output(); err == nil {
			parseRepoStatus(string(output), &repo)
		}

		// Get last activity (last commit date)
		cmd = exec.Command("git", "-C", path, "log", "-1", "--format=%aI")
		if output, err := cmd.Output(); err == nil {
			lastActivity := strings.TrimSpace(string(output))
			if lastActivity != "" {
				repo.LastActivity = &lastActivity
			}
		}

		// Get worktrees
		cmd = exec.Command("git", "-C", path, "worktree", "list", "--porcelain")
		if output, err := cmd.Output(); err == nil {
			repo.Worktrees = parseWorktrees(string(output))
		}

		*repos = append(*repos, repo)
		return // Don't recurse into git repos
	}

	// Read directory entries
	entries, err := os.ReadDir(path)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		name := entry.Name()
		// Skip hidden and ignored directories
		if strings.HasPrefix(name, ".") || utils.ShouldIgnoreDir(name) {
			continue
		}

		findGitRepos(filepath.Join(path, name), currentDepth+1, maxDepth, repos)
	}
}

// remoteToGithubURL converts a git remote URL to a GitHub web URL
func remoteToGithubURL(remoteURL string) *string {
	if remoteURL == "" {
		return nil
	}

	url := remoteURL

	// Handle SSH format: git@github.com:user/repo.git
	if strings.HasPrefix(url, "git@github.com:") {
		url = strings.TrimPrefix(url, "git@github.com:")
		url = strings.TrimSuffix(url, ".git")
		result := "https://github.com/" + url
		return &result
	}

	// Handle HTTPS format: https://github.com/user/repo.git
	if strings.Contains(url, "github.com") {
		url = strings.TrimSuffix(url, ".git")
		return &url
	}

	return nil
}

// parseRepoStatus parses git status --porcelain output into staged/unstaged/untracked
func parseRepoStatus(output string, repo *models.GitRepoInfo) {
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if len(line) < 3 {
			continue
		}

		indexStatus := line[0]
		workTreeStatus := line[1]
		filePath := strings.TrimSpace(line[3:])

		// Handle renames
		if strings.Contains(filePath, " -> ") {
			parts := strings.Split(filePath, " -> ")
			filePath = parts[1]
		}

		// Untracked
		if indexStatus == '?' && workTreeStatus == '?' {
			repo.Untracked = append(repo.Untracked, models.GitFile{
				Path:   filePath,
				Status: "?",
			})
			continue
		}

		// Staged changes (index has changes)
		if indexStatus != ' ' && indexStatus != '?' {
			repo.Staged = append(repo.Staged, models.GitFile{
				Path:   filePath,
				Status: string(indexStatus),
			})
		}

		// Unstaged changes (worktree has changes)
		if workTreeStatus != ' ' && workTreeStatus != '?' {
			repo.Unstaged = append(repo.Unstaged, models.GitFile{
				Path:   filePath,
				Status: string(workTreeStatus),
			})
		}
	}
}

// parseWorktrees parses git worktree list --porcelain output
func parseWorktrees(output string) []models.GitWorktree {
	var worktrees []models.GitWorktree
	var current *models.GitWorktree

	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "worktree ") {
			if current != nil {
				worktrees = append(worktrees, *current)
			}
			current = &models.GitWorktree{
				Path: strings.TrimPrefix(line, "worktree "),
			}
		} else if strings.HasPrefix(line, "HEAD ") && current != nil {
			current.Head = strings.TrimPrefix(line, "HEAD ")
		} else if strings.HasPrefix(line, "branch ") && current != nil {
			branch := strings.TrimPrefix(line, "branch ")
			// Strip refs/heads/ prefix
			branch = strings.TrimPrefix(branch, "refs/heads/")
			current.Branch = branch
		} else if line == "detached" && current != nil {
			current.Detached = true
		} else if line == "bare" && current != nil {
			current.Bare = true
		}
	}

	if current != nil {
		worktrees = append(worktrees, *current)
	}

	return worktrees
}

// GitGraph handles GET /api/git/graph - get commit history
func GitGraph(w http.ResponseWriter, r *http.Request) {
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

	path = filepath.Clean(path)

	// Find git root
	gitRoot := findGitRoot(path)
	if gitRoot == "" {
		http.Error(w, `{"error": "not a git repository"}`, http.StatusBadRequest)
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	skip := 0
	if s := r.URL.Query().Get("skip"); s != "" {
		if parsed, err := strconv.Atoi(s); err == nil {
			skip = parsed
		}
	}

	// Git log format: hash|short|author|email|date|parents|refs|subject
	format := "%H|%h|%an|%ae|%aI|%P|%D|%s"

	cmd := exec.Command("git", "-C", gitRoot, "log",
		"--all",
		fmt.Sprintf("--format=%s", format),
		fmt.Sprintf("-n%d", limit+1), // +1 to detect hasMore
		fmt.Sprintf("--skip=%d", skip),
	)

	output, err := cmd.Output()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "git log failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	commits := parseGitLog(string(output))

	hasMore := len(commits) > limit
	if hasMore {
		commits = commits[:limit]
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": models.GitGraphResponse{
			Commits: commits,
			HasMore: hasMore,
		},
	})
}

func parseGitLog(output string) []models.GitCommit {
	var commits []models.GitCommit

	lines := strings.Split(strings.TrimSpace(output), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|", 8)
		if len(parts) < 8 {
			continue
		}

		commit := models.GitCommit{
			Hash:        parts[0],
			ShortHash:   parts[1],
			Author:      parts[2],
			AuthorEmail: parts[3],
			Date:        parts[4],
			Message:     parts[7],
		}

		// Parse parents
		if parts[5] != "" {
			commit.ParentHashes = strings.Fields(parts[5])
			commit.IsMerge = len(commit.ParentHashes) > 1
		}

		// Parse refs (branches, tags)
		if parts[6] != "" {
			refs := strings.Split(parts[6], ", ")
			for _, ref := range refs {
				ref = strings.TrimSpace(ref)
				if ref != "" {
					commit.Refs = append(commit.Refs, ref)
				}
			}
		}

		commits = append(commits, commit)
	}

	return commits
}

// GitCommit handles GET /api/git/commit/:hash - get commit details
func GitCommitDetails(w http.ResponseWriter, r *http.Request) {
	// Extract hash from path (e.g., /api/git/commit/abc123)
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		http.Error(w, `{"error": "commit hash required"}`, http.StatusBadRequest)
		return
	}
	hash := pathParts[4]

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

	path = filepath.Clean(path)

	gitRoot := findGitRoot(path)
	if gitRoot == "" {
		http.Error(w, `{"error": "not a git repository"}`, http.StatusBadRequest)
		return
	}

	// Get commit info
	format := "%H|%h|%an|%ae|%aI|%P|%D|%s|%b"
	cmd := exec.Command("git", "-C", gitRoot, "log", "-1", fmt.Sprintf("--format=%s", format), hash)
	output, err := cmd.Output()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "commit not found: %s"}`, err.Error()), http.StatusNotFound)
		return
	}

	line := strings.TrimSpace(string(output))
	parts := strings.SplitN(line, "|", 9)
	if len(parts) < 9 {
		http.Error(w, `{"error": "failed to parse commit"}`, http.StatusInternalServerError)
		return
	}

	details := models.GitCommitDetails{
		GitCommit: models.GitCommit{
			Hash:        parts[0],
			ShortHash:   parts[1],
			Author:      parts[2],
			AuthorEmail: parts[3],
			Date:        parts[4],
			Message:     parts[7],
		},
		Body: strings.TrimSpace(parts[8]),
	}

	// Parse parents
	if parts[5] != "" {
		details.ParentHashes = strings.Fields(parts[5])
		details.IsMerge = len(details.ParentHashes) > 1
	}

	// Parse refs
	if parts[6] != "" {
		refs := strings.Split(parts[6], ", ")
		for _, ref := range refs {
			ref = strings.TrimSpace(ref)
			if ref != "" {
				details.Refs = append(details.Refs, ref)
			}
		}
	}

	// Get changed files
	cmd = exec.Command("git", "-C", gitRoot, "diff-tree", "--no-commit-id", "--name-status", "-r", "--numstat", hash)
	output, err = cmd.Output()
	if err == nil {
		details.Files = parseCommitFiles(string(output), gitRoot, hash)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": details,
	})
}

func parseCommitFiles(output string, gitRoot string, hash string) []models.GitFileChange {
	// Get name-status output
	cmd := exec.Command("git", "-C", gitRoot, "diff-tree", "--no-commit-id", "--name-status", "-r", hash)
	statusOutput, err := cmd.Output()
	if err != nil {
		return nil
	}

	// Get numstat for additions/deletions
	cmd = exec.Command("git", "-C", gitRoot, "diff-tree", "--no-commit-id", "--numstat", "-r", hash)
	numstatOutput, err := cmd.Output()
	if err != nil {
		return nil
	}

	// Parse name-status
	statusMap := make(map[string]string)
	for _, line := range strings.Split(strings.TrimSpace(string(statusOutput)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			status := parts[0]
			path := parts[1]
			// Handle renames (R100	old	new)
			if strings.HasPrefix(status, "R") && len(parts) >= 3 {
				path = parts[2]
			}
			statusMap[path] = status
		}
	}

	// Parse numstat
	var files []models.GitFileChange
	for _, line := range strings.Split(strings.TrimSpace(string(numstatOutput)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}

		additions, _ := strconv.Atoi(parts[0])
		deletions, _ := strconv.Atoi(parts[1])
		path := parts[2]

		// Handle binary files (show as - -)
		if parts[0] == "-" {
			additions = 0
		}
		if parts[1] == "-" {
			deletions = 0
		}

		// Handle renames
		if strings.Contains(path, "=>") {
			// Format: old => new or {prefix/old => prefix/new}
			path = strings.TrimSpace(strings.Split(path, "=>")[1])
			path = strings.TrimSuffix(path, "}")
		}

		status := statusMap[path]
		if status == "" {
			status = "M"
		}

		file := models.GitFileChange{
			Path:      path,
			Status:    string(status[0]), // Just first char (R100 -> R)
			Additions: additions,
			Deletions: deletions,
		}

		files = append(files, file)
	}

	return files
}

// GitDiff handles GET /api/git/diff - get file diff
func GitDiff(w http.ResponseWriter, r *http.Request) {
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

	path = filepath.Clean(path)

	gitRoot := findGitRoot(path)
	if gitRoot == "" {
		http.Error(w, `{"error": "not a git repository"}`, http.StatusBadRequest)
		return
	}

	base := r.URL.Query().Get("base") // Commit hash or "HEAD"
	file := r.URL.Query().Get("file") // Optional specific file

	var args []string
	args = append(args, "-C", gitRoot, "diff")

	if base != "" {
		if base == "HEAD" {
			// Diff against HEAD (unstaged changes)
			args = append(args, "HEAD")
		} else {
			// Diff for a specific commit
			args = append(args, base+"^", base)
		}
	}

	if file != "" {
		args = append(args, "--", file)
	}

	cmd := exec.Command("git", args...)
	output, err := cmd.Output()
	if err != nil {
		// Try without the parent (first commit)
		if base != "" && base != "HEAD" {
			args = []string{"-C", gitRoot, "show", base, "--format="}
			if file != "" {
				args = append(args, "--", file)
			}
			cmd = exec.Command("git", args...)
			output, err = cmd.Output()
		}
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "git diff failed: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
	}

	response := models.GitDiffResponse{
		Diff:     string(output),
		FilePath: file,
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": response,
	})
}

// resolveRepoPath resolves the repo path from URL params and query string.
// Expects chi route: /api/git/repos/{repo}/{operation}?dir=...
func resolveRepoPath(r *http.Request) (string, error) {
	repo := chi.URLParam(r, "repo")
	dir := r.URL.Query().Get("dir")
	if repo == "" || dir == "" {
		return "", fmt.Errorf("repo and dir parameters required")
	}

	// Expand home directory
	if strings.HasPrefix(dir, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			dir = filepath.Join(home, dir[1:])
		}
	}

	repoPath := filepath.Join(filepath.Clean(dir), repo)
	if !utils.IsGitRepo(repoPath) {
		return "", fmt.Errorf("not a git repository: %s", repoPath)
	}
	return repoPath, nil
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   msg,
	})
}

func jsonSuccess(w http.ResponseWriter, extra map[string]interface{}) {
	resp := map[string]interface{}{"success": true}
	for k, v := range extra {
		resp[k] = v
	}
	json.NewEncoder(w).Encode(resp)
}

// GitRepoStage handles POST /api/git/repos/{repo}/stage
func GitRepoStage(w http.ResponseWriter, r *http.Request) {
	repoPath, err := resolveRepoPath(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var body struct {
		Files []string `json:"files"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(body.Files) == 0 {
		body.Files = []string{"."}
	}

	args := append([]string{"-C", repoPath, "add"}, body.Files...)
	cmd := exec.Command("git", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		jsonError(w, fmt.Sprintf("git add failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
		return
	}

	jsonSuccess(w, nil)
}

// GitRepoUnstage handles POST /api/git/repos/{repo}/unstage
func GitRepoUnstage(w http.ResponseWriter, r *http.Request) {
	repoPath, err := resolveRepoPath(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var body struct {
		Files []string `json:"files"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(body.Files) == 0 {
		jsonError(w, "files required", http.StatusBadRequest)
		return
	}

	args := append([]string{"-C", repoPath, "reset", "HEAD", "--"}, body.Files...)
	cmd := exec.Command("git", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		jsonError(w, fmt.Sprintf("git reset failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
		return
	}

	jsonSuccess(w, nil)
}

// GitRepoCommit handles POST /api/git/repos/{repo}/commit
func GitRepoCommit(w http.ResponseWriter, r *http.Request) {
	repoPath, err := resolveRepoPath(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var body struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(body.Message) == "" {
		jsonError(w, "commit message required", http.StatusBadRequest)
		return
	}

	cmd := exec.Command("git", "-C", repoPath, "commit", "-m", body.Message)
	output, err := cmd.CombinedOutput()
	if err != nil {
		jsonError(w, fmt.Sprintf("git commit failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
		return
	}

	jsonSuccess(w, map[string]interface{}{
		"output": strings.TrimSpace(string(output)),
	})
}

// GitRepoPush handles POST /api/git/repos/{repo}/push
func GitRepoPush(w http.ResponseWriter, r *http.Request) {
	repoPath, err := resolveRepoPath(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	cmd := exec.Command("git", "-C", repoPath, "push")
	output, err := cmd.CombinedOutput()
	if err != nil {
		jsonError(w, fmt.Sprintf("git push failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
		return
	}

	jsonSuccess(w, map[string]interface{}{
		"output": strings.TrimSpace(string(output)),
	})
}

// GitRepoPull handles POST /api/git/repos/{repo}/pull
func GitRepoPull(w http.ResponseWriter, r *http.Request) {
	repoPath, err := resolveRepoPath(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	cmd := exec.Command("git", "-C", repoPath, "pull")
	output, err := cmd.CombinedOutput()
	if err != nil {
		jsonError(w, fmt.Sprintf("git pull failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
		return
	}

	jsonSuccess(w, map[string]interface{}{
		"output": strings.TrimSpace(string(output)),
	})
}

// GitRepoFetch handles POST /api/git/repos/{repo}/fetch
func GitRepoFetch(w http.ResponseWriter, r *http.Request) {
	repoPath, err := resolveRepoPath(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	cmd := exec.Command("git", "-C", repoPath, "fetch")
	output, err := cmd.CombinedOutput()
	if err != nil {
		jsonError(w, fmt.Sprintf("git fetch failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
		return
	}

	jsonSuccess(w, map[string]interface{}{
		"output": strings.TrimSpace(string(output)),
	})
}

// GitRepoDiscard handles POST /api/git/repos/{repo}/discard
func GitRepoDiscard(w http.ResponseWriter, r *http.Request) {
	repoPath, err := resolveRepoPath(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var body struct {
		Files []string `json:"files"`
		All   bool     `json:"all"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if body.All {
		// Discard all changes: checkout all tracked files, clean untracked
		cmd := exec.Command("git", "-C", repoPath, "checkout", ".")
		output, err := cmd.CombinedOutput()
		if err != nil {
			jsonError(w, fmt.Sprintf("git checkout failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
			return
		}

		cmd = exec.Command("git", "-C", repoPath, "clean", "-fd")
		output, err = cmd.CombinedOutput()
		if err != nil {
			jsonError(w, fmt.Sprintf("git clean failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
			return
		}
	} else {
		if len(body.Files) == 0 {
			jsonError(w, "files required", http.StatusBadRequest)
			return
		}

		args := append([]string{"-C", repoPath, "checkout", "--"}, body.Files...)
		cmd := exec.Command("git", args...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			jsonError(w, fmt.Sprintf("git checkout failed: %s", strings.TrimSpace(string(output))), http.StatusInternalServerError)
			return
		}
	}

	jsonSuccess(w, nil)
}

// GitRepoGenerateMessage handles POST /api/git/repos/{repo}/generate-message
func GitRepoGenerateMessage(w http.ResponseWriter, r *http.Request) {
	repoPath, err := resolveRepoPath(r)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Get the staged diff
	cmd := exec.Command("git", "-C", repoPath, "diff", "--cached")
	diffOutput, err := cmd.Output()
	if err != nil {
		jsonError(w, "failed to get staged diff", http.StatusInternalServerError)
		return
	}

	diff := strings.TrimSpace(string(diffOutput))
	if diff == "" {
		jsonError(w, "no staged changes to describe", http.StatusBadRequest)
		return
	}

	// Truncate diff if too large
	if len(diff) > 8000 {
		diff = diff[:8000] + "\n... (truncated)"
	}

	// Use git log to get recent commit style
	cmd = exec.Command("git", "-C", repoPath, "log", "--oneline", "-5")
	logOutput, _ := cmd.Output()

	prompt := fmt.Sprintf(
		"Generate a concise git commit message (1-2 lines) for these staged changes. "+
			"Follow conventional commits style if the project uses it. "+
			"Recent commits for style reference:\n%s\n\nDiff:\n%s",
		strings.TrimSpace(string(logOutput)),
		diff,
	)

	// Try using claude CLI to generate the message
	cmd = exec.Command("claude", "-p", prompt)
	cmd.Dir = repoPath
	output, err := cmd.Output()
	if err != nil {
		// Fallback: generate a simple message from the diff stat
		cmd = exec.Command("git", "-C", repoPath, "diff", "--cached", "--stat")
		statOutput, _ := cmd.Output()
		jsonSuccess(w, map[string]interface{}{
			"message": fmt.Sprintf("Update %s", strings.TrimSpace(string(statOutput))),
		})
		return
	}

	// Clean up Claude's response
	msg := strings.TrimSpace(string(output))
	// Remove markdown code fences if present
	msg = strings.TrimPrefix(msg, "```")
	msg = strings.TrimSuffix(msg, "```")
	msg = strings.TrimSpace(msg)

	jsonSuccess(w, map[string]interface{}{
		"message": msg,
	})
}
