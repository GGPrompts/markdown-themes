package models

// FileTreeNode represents a file or directory in the tree
type FileTreeNode struct {
	Name      string         `json:"name"`
	Path      string         `json:"path"`
	Type      string         `json:"type"` // "file" or "directory"
	Size      int64          `json:"size,omitempty"`
	Modified  string         `json:"modified,omitempty"`
	Children  []FileTreeNode `json:"children,omitempty"`
	IsSymlink bool           `json:"isSymlink,omitempty"`
	IsGitRepo bool           `json:"isGitRepo,omitempty"`
	GitBranch string         `json:"gitBranch,omitempty"`
	GitDirty  bool           `json:"gitDirty,omitempty"`
	Icon      string         `json:"icon,omitempty"`
}

// FileContent represents the content response for a single file
type FileContent struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	FileName string `json:"fileName"`
	FileSize int64  `json:"fileSize"`
	Modified string `json:"modified"`
}

// GitStatusInfo represents the status of a single file in git
type GitStatusInfo struct {
	Status         string `json:"status"` // "staged", "modified", "untracked"
	IndexStatus    string `json:"indexStatus"`
	WorkTreeStatus string `json:"workTreeStatus"`
}

// GitStatusResponse represents the git status of a directory
type GitStatusResponse struct {
	IsGitRepo bool                     `json:"isGitRepo"`
	Files     map[string]GitStatusInfo `json:"files"`
}

// GitCommit represents a commit in the git graph
type GitCommit struct {
	Hash          string   `json:"hash"`
	ShortHash     string   `json:"shortHash"`
	Message       string   `json:"message"`
	Author        string   `json:"author"`
	AuthorEmail   string   `json:"authorEmail"`
	Date          string   `json:"date"`
	ParentHashes  []string `json:"parents"`
	Refs          []string `json:"refs,omitempty"`
	IsMerge       bool     `json:"isMerge"`
}

// GitGraphResponse represents the response from the git graph endpoint
type GitGraphResponse struct {
	Commits    []GitCommit `json:"commits"`
	HasMore    bool        `json:"hasMore"`
	TotalCount int         `json:"totalCount,omitempty"`
}

// GitRepoInfo represents detailed info about a git repository
type GitRepoInfo struct {
	Path         string        `json:"path"`
	Name         string        `json:"name"`
	Branch       string        `json:"branch"`
	Tracking     string        `json:"tracking,omitempty"`
	Ahead        int           `json:"ahead"`
	Behind       int           `json:"behind"`
	Staged       []GitFile     `json:"staged"`
	Unstaged     []GitFile     `json:"unstaged"`
	Untracked    []GitFile     `json:"untracked"`
	GithubURL    *string       `json:"githubUrl"`
	LastActivity *string       `json:"lastActivity"`
	Worktrees    []GitWorktree `json:"worktrees"`
	IsDirty      bool          `json:"isDirty"`
	RemoteURL    string        `json:"remoteUrl,omitempty"`
	Error        string        `json:"error,omitempty"`
}

// GitFile represents a file in git status
type GitFile struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

// GitWorktree represents a git worktree
type GitWorktree struct {
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Head      string `json:"head,omitempty"`
	GithubURL string `json:"githubUrl,omitempty"`
	Detached  bool   `json:"detached,omitempty"`
	Bare      bool   `json:"bare,omitempty"`
}

// GitReposResponse is the wrapper response for /api/git/repos
type GitReposResponse struct {
	Success bool         `json:"success"`
	Data    GitReposData `json:"data"`
}

// GitReposData contains the repos list and metadata
type GitReposData struct {
	ProjectsDir string        `json:"projectsDir"`
	Repos       []GitRepoInfo `json:"repos"`
}

// ClaudeSessionInfo represents info about an active Claude session
type ClaudeSessionInfo struct {
	SessionID        string `json:"sessionId"`
	WorkingDir       string `json:"workingDir"`
	ConversationPath string `json:"conversationPath"`
	Pane             string `json:"pane"`
	Status           string `json:"status"`
}

// GitDiffResponse represents a file diff
type GitDiffResponse struct {
	Diff     string `json:"diff"`
	FilePath string `json:"filePath"`
	OldPath  string `json:"oldPath,omitempty"`
	Status   string `json:"status"` // "A", "M", "D", "R"
}

// GitCommitDetails represents detailed info about a commit
type GitCommitDetails struct {
	GitCommit
	Body  string          `json:"body,omitempty"`
	Files []GitFileChange `json:"files"`
}

// GitFileChange represents a file changed in a commit
type GitFileChange struct {
	Path      string `json:"path"`
	OldPath   string `json:"oldPath,omitempty"`
	Status    string `json:"status"` // "A", "M", "D", "R"
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}
