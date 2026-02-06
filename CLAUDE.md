# Markdown Themes

A themed markdown viewer for AI-assisted writing. Watch Claude edit files in real-time with beautiful style guide themes.

## Stack

- **Go Backend** - Self-contained file watching server (port 8130)
- **React 19** - UI
- **Tailwind v4** - CSS-based config with `@theme` directive
- **Streamdown** - Vercel's react-markdown replacement for AI streaming
- **Shiki** - Syntax highlighting (via @streamdown/code)

## Architecture

```
WSL (Go backend @ 8130)             Browser (Chrome)
┌───────────────────────────────┐   ┌─────────────────────┐
│  /api/files/tree              │   │  markdown-themes    │
│  /api/files/content           │◄─►│  - Streamdown       │
│  /api/git/* endpoints         │   │  - Themes (CSS)     │
│  /api/chat/* (SSE + CRUD)     │   │  - AI Chat (SSE)    │
│  SQLite (conversations.db)    │   │                     │
│  WebSocket file-watch msgs    │   │                     │
└───────────────────────────────┘   └─────────────────────┘
```

**Requires**: Go backend running on port 8130

## Project Structure

```
backend/                       # Go backend server
├── main.go                    # Entry point, Chi router, CORS middleware
├── go.mod                     # Go module dependencies
├── db/
│   └── conversations.go       # SQLite layer (conversations + messages tables)
├── handlers/
│   ├── files.go               # File tree, content, git status APIs
│   ├── git.go                 # Git graph, commit details, diff APIs
│   ├── chat.go                # Claude AI chat SSE proxy with reconnect buffering
│   ├── claude.go              # Claude CLI session detection helpers
│   └── conversations.go       # Conversation CRUD REST handlers
├── websocket/
│   ├── hub.go                 # WebSocket connection management
│   └── filewatcher.go         # fsnotify integration, streaming detection
├── models/
│   └── types.go               # FileTreeNode, GitCommit, etc.
└── utils/
    └── files.go               # File icons, git helpers, ignore patterns

src/
├── App.tsx                    # Main app, routing, theme state
├── index.css                  # Tailwind + CSS variables + modal styles
├── lib/
│   ├── api.ts                 # Backend API client, WebSocket, file operations
│   ├── filters.ts             # File tree filter presets
│   └── graphLayout.ts         # Git graph rail layout algorithm
├── pages/
│   ├── Landing.tsx            # Home page with navigation cards
│   └── Files.tsx              # Main markdown viewer with sidebar
├── components/
│   ├── MarkdownViewer.tsx     # Streamdown renderer
│   ├── Sidebar.tsx            # File tree with search + filters
│   ├── Toolbar.tsx            # File toolbar (open, copy, send to chat, follow mode)
│   ├── TabBar.tsx             # Left pane tab bar
│   ├── RightPaneTabBar.tsx    # Right pane tab bar
│   ├── SplitView.tsx          # Split view container with drag resize
│   ├── NavHeader.tsx          # Top navigation bar (Home, Files links + theme/project selectors)
│   ├── MetadataBar.tsx        # Frontmatter metadata display bar
│   ├── ViewerContainer.tsx    # File type detection + viewer dispatch
│   ├── FileContextMenu.tsx    # Right-click context menu for files
│   ├── FilePickerModal.tsx    # File/folder browser modal
│   ├── ArchiveModal.tsx       # Conversation archive dialog
│   ├── ProjectSelector.tsx    # Workspace folder selector dropdown
│   ├── ThemeSelector.tsx      # Theme picker dropdown
│   ├── PromptNotebook.tsx     # Prompty renderer with inline fields
│   ├── InlineField.tsx        # Editable {{variable}} fields
│   ├── chat/                  # AI Chat panel (ChatPanel, ChatInput, ChatMessage, ChatSettings)
│   ├── viewers/               # File type viewers (see Supported File Types)
│   └── git/                   # Git components (GitGraph, WorkingTree, MultiRepoView, etc.)
├── context/
│   ├── AppStoreContext.tsx    # localStorage persistence (theme, recent files, favorites)
│   ├── AIChatContext.tsx      # App-level AI chat provider (wraps useAIChat)
│   ├── WorkspaceContext.tsx   # Current workspace path + file tree
│   └── PageStateContext.tsx   # In-memory page state (tabs, split view, chat tabs)
├── hooks/
│   ├── useAIChat.ts           # AI chat state, SSE streaming, conversation persistence
│   ├── useFileWatcher.ts      # WebSocket file watching + streaming detection
│   ├── useWorkspaceStreaming.ts # Workspace-wide streaming detection (Follow AI Edits)
│   ├── useDiffAutoScroll.ts   # Auto-scroll to changes during streaming
│   ├── useGitDiff.ts          # Git diff highlighting (additions, modifications, deletions)
│   ├── useGitOperations.ts    # Git stage/unstage/discard operations
│   ├── useBulkGitOperations.ts # Bulk git stage/unstage across repos
│   ├── useGitRepos.ts         # Git repository scanning
│   ├── useWorkspace.ts        # File tree via backend API
│   ├── useTabManager.ts       # Tab state management for left pane
│   ├── useRightPaneTabs.ts    # Tab state management for right pane
│   ├── useSplitView.ts        # Split view state for Files page
│   ├── useFileFilter.ts       # File tree filter logic (by extension, git status, etc.)
│   ├── useCurrentConversation.ts # Active Claude conversation detection
│   ├── useSubagentWatcher.ts  # Monitor Claude subagent activity
│   ├── useMouseSpotlight.ts   # Mouse-following spotlight effect (Noir theme)
│   └── useAppStore.ts         # Hook for AppStoreContext
├── utils/
│   ├── frontmatter.ts         # YAML frontmatter parser
│   ├── markdownDiff.ts        # Block-level diffing for auto-scroll
│   ├── promptyUtils.ts        # Prompty parsing + variable handling
│   ├── conversationMarkdown.ts # JSONL conversation to markdown converter
│   ├── exportHtml.ts          # Export themed markdown as standalone HTML
│   └── fileIcons.ts           # File extension to icon/color mapping
└── themes/
    ├── index.ts               # Theme registry (30 themes)
    └── *.css                  # Theme CSS files
```

## Key Concepts

### File Watching (WebSocket)
`useFileWatcher` connects to the Go backend's WebSocket and subscribes to file changes:
- Sends `{ type: 'file-watch', path }` to subscribe
- Receives `{ type: 'file-content', content, modified, size }` on initial subscribe
- Receives `{ type: 'file-change', content, timeSinceLastChange }` on modifications
- Receives `{ type: 'file-deleted', path }` when file is removed
- Streaming detection: `timeSinceLastChange < 1500ms` triggers streaming UI

### Streaming Detection
When rapid file changes are detected (< 1.5s apart):
- Streamdown's `caret="block"` shows typing cursor
- "AI writing..." indicator in toolbar
- `parseIncompleteMarkdown` for mid-stream rendering

### Follow AI Edits
The toolbar has a "Follow AI Edits" button that auto-opens files as Claude writes to them:

**How it works:**
1. `useWorkspaceStreaming` subscribes to `workspace-watch` via WebSocket
2. Go backend monitors the entire workspace directory with fsnotify
3. On first file change or rapid changes (streaming), server broadcasts `workspace-file-change`
4. Client receives the message and auto-opens the file
5. Existing `useFileWatcher` then shows live content updates

**WebSocket messages:**
- `{ type: 'workspace-watch', path }` - Subscribe to workspace
- `{ type: 'workspace-unwatch', path }` - Unsubscribe
- `{ type: 'workspace-file-change', path, isStreaming }` - File being edited

**Ignored directories:** `node_modules`, `.git`, `dist`, `build`, `.next`, etc.

### Auto-Scroll to Changes
When streaming is detected, the viewer auto-scrolls to show where Claude is editing:

**How it works:**
1. `useDiffAutoScroll` hook tracks previous content in a ref
2. On content change during streaming, diffs old vs new at block level
3. Finds the first changed paragraph/heading/code block
4. Scrolls smoothly to that position in the viewport

**Block-level diffing** (`src/utils/markdownDiff.ts`):
- Splits markdown by double newlines (paragraphs)
- Preserves code blocks as single units
- Returns scroll percentage based on changed block position

**User interruption:**
- If user manually scrolls during streaming, auto-scroll pauses
- Resumes when streaming stops or user resets

### Git Diff Highlighting
Code files show git diff highlighting after streaming stops, letting you see exactly what changed:

**Visual indicators:**
- 🟢 Green background: added lines
- 🟡 Yellow background: modified lines
- 🔴 Red background + strikethrough: deleted lines (shown as virtual lines)
- Accent border: recent edit indicator (during streaming)

**How it works:**
1. `useGitDiff` hook fetches diff from `/api/git/diff` API
2. Parses unified diff to extract additions, modifications, and deletions
3. `CodeViewer` renders highlights on actual lines + inserts virtual deleted lines
4. Gutter shows "−" for deleted lines

**Performance:**
- Disabled during streaming (`enabled: !isStreaming`) to avoid render thrashing
- 1 second debounce after streaming stops before fetching diff
- Stable empty references prevent unnecessary re-renders

**CSS variables** (defined in `index.css`):
```css
--diff-added: rgba(34, 197, 94, 0.25);    /* green */
--diff-modified: rgba(250, 204, 21, 0.25); /* yellow */
--diff-deleted: rgba(239, 68, 68, 0.25);   /* red */
```

### Theming
Themes use CSS custom properties. Each theme file sets variables like:
```css
.theme-dark-academia {
  --bg-primary: #1a1915;
  --text-primary: #d4c5a9;
  --accent: #8b7355;
  --font-body: 'Cormorant Garamond', serif;
}
```

Tailwind's `@theme` directive maps these to utility classes.

### Prompty Files
`.prompty` files are markdown documents with YAML frontmatter and fillable `{{variable}}` placeholders:
- `{{variable}}` - text input field
- `{{variable:hint text}}` - text input with placeholder hint
- `{{variable:opt1|opt2|opt3}}` - dropdown select

The `PromptNotebook` component renders these with inline editable fields. Fields named `file`, `path`, `project`, `folder`, etc. automatically show a file picker button.

### FilePickerModal
Reusable modal for browsing and selecting files/folders. Used in:
- Inline fields for file/folder path variables in PromptNotebook
- Supports modes: `file`, `folder`, or `both`

### Supported File Types
The app auto-detects file types and renders with appropriate viewers:

| Type | Extensions | Viewer |
|------|------------|--------|
| Markdown | `.md`, `.mdx` | Streamdown with themes |
| Prompty | `.prompty` | PromptNotebook with inline fields |
| Code | `.ts`, `.js`, `.py`, `.css`, etc. | Shiki syntax highlighting |
| JSON | `.json`, `.jsonc` | Collapsible tree with syntax highlighting |
| JSONL | `.jsonl`, `.ndjson` | Line-by-line JSON viewer |
| Conversation | `.jsonl` in `~/.claude/projects/` | ConversationMarkdownViewer |
| CSV | `.csv`, `.tsv` | Table view |
| Images | `.png`, `.jpg`, `.gif`, `.webp` | ImageViewer with zoom |
| SVG | `.svg` | SvgViewer (rendered + source toggle) |
| Video | `.mp4`, `.webm`, `.mov` | VideoViewer with controls |
| Audio | `.mp3`, `.wav`, `.ogg` | AudioViewer with waveform |
| PDF | `.pdf` | PdfViewer (page navigation) |

### Page State Persistence
`PageStateContext` preserves UI state when navigating between pages. State is held in memory only—refreshing the page resets it.

| Page | Preserved State |
|------|-----------------|
| Files | Open tabs, active tab, split view, split ratio, right pane file, chat tabs, active chat tab |

The hooks `useTabManager` and `useSplitView` accept optional `initialState` and `onStateChange` props to sync with the context.

### Send to Chat
The toolbar and context menu have "Send to Chat" buttons that send content to the built-in AI Chat panel:
- Toolbar button sends current file content
- Right-click context menu sends file content as a code block
- `.prompty` files send the prompt with variables filled in
- Opens the chat panel and creates a new conversation via `sendToChat()` from `useAIChat`

### Optional TabzChrome Integration
Some features require TabzChrome (port 8129) running alongside the Go backend:

**Spawn Terminals** - Used by GitGraph's "Gitlogue" button (requires TabzChrome)

Note: Core file viewing and watching works with just the Go backend.

### GitGraph
The Files page toolbar has a git graph button that shows commit history in the right pane:

- **GitGraph** (`components/git/GitGraph.tsx`) - Renders commit history with canvas rail lines
- **CommitDetails** (`components/git/CommitDetails.tsx`) - Expandable commit details shown when clicking a row
- **DiffViewer** (`components/viewers/DiffViewer.tsx`) - Shows file diffs when clicking "View" on changed files

**Expanding commits:** Click a commit row to see:
- Full commit message and body
- List of changed files (A/M/D status)
- Copy Hash button (copies full SHA)
- Gitlogue button (spawns terminal to replay commit)

**APIs used:**
- `GET /api/git/graph?path=...&limit=50&skip=0` - Paginated commit list
- `GET /api/git/commit/:hash?path=...` - Commit details with files
- `GET /api/git/diff?path=...&base=hash&file=path` - File diff for a commit

### AI Chat

The app includes an AI chat panel that streams responses from Claude via the Go backend.

**Architecture:**
- `useAIChat` hook manages conversations, messages, and SSE streaming
- `AIChatContext` provides chat state app-wide (wraps `useAIChat`)
- `ChatPanel` renders the UI with multi-conversation tabs
- Go backend proxies requests to Claude CLI and streams responses via SSE

**SSE Streaming with Reconnect Buffering:**
The backend buffers SSE events per conversation so clients can reconnect without losing output:
- Each SSE event gets a sequential `id:` field (per SSE spec)
- `ConversationBuffer` stores up to 1000 events per conversation
- On reconnect, client sends `lastEventId` and backend replays missed events
- Buffers expire 5 minutes after conversation completes
- Background cleanup goroutine runs every minute

**Conversation Persistence (SQLite):**
Conversations are stored in SQLite at `~/.local/share/markdown-themes/conversations.db`:
- Tables: `conversations` (id, title, cwd, settings JSON, etc.) and `messages` (role, content, usage JSON, etc.)
- REST API: `GET/POST /api/chat/conversations`, `GET/PUT/DELETE /api/chat/conversations/{id}`
- Frontend loads from backend on mount, falls back to localStorage if backend unavailable
- Auto-migrates existing localStorage conversations on first run

**Multi-Conversation Tabs:**
The chat panel supports multiple open conversations as tabs:
- `chatTabs` (conversation IDs) and `activeChatTabId` persisted in `PageStateContext`
- Tab bar shows truncated title, streaming indicator dot, close button on hover
- Click conversation in list to open as tab; middle-click or close button removes tab
- Back button returns to conversation list without closing tabs

## Keyboard Shortcuts

### Files Page
| Shortcut | Action |
|----------|--------|
| `?` | Show keyboard shortcuts |
| `/` | Focus sidebar search |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+\` | Toggle split view |
| `Ctrl+G` | Toggle git graph |
| `Ctrl+Shift+G` | Toggle working tree |
| `Ctrl+Shift+C` | Toggle AI chat panel |
| `Ctrl+Click` | Open file in right pane (when split) |
| `Escape` | Clear focus |

## Commands

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
npm run test:run     # Run tests once (use before commits)
npm test             # Run tests in watch mode
```

## Testing

Tests use Vitest + React Testing Library. Run `npm run test:run` before committing.

**Test coverage:**
- `src/utils/frontmatter.test.ts` - YAML frontmatter parsing
- `src/utils/promptyUtils.test.ts` - Prompty variable detection/substitution
- `src/utils/markdownDiff.test.ts` - Block-level diffing for auto-scroll
- `src/utils/conversationMarkdown.test.ts` - JSONL conversation to markdown
- `src/lib/filters.test.ts` - File tree filtering
- `src/lib/graphLayout.test.ts` - Git graph layout algorithm
- `src/context/AppStoreContext.test.tsx` - localStorage persistence
- `src/components/viewers/JsonViewer.test.ts` - JSONC comment stripping
- `src/components/viewers/JsonlViewer.test.ts` - JSONL line parsing
- `src/components/viewers/DiffViewer.test.ts` - Unified diff parsing

## Prerequisites

1. Start the Go backend:
   ```bash
   cd backend && go run .
   # Or build first: go build && ./markdown-themes-backend
   ```

2. Start the frontend dev server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:5173 in browser

**Optional**: For TabzChrome features (Spawn Terminals, Edit in editor), also run:
```bash
cd ~/projects/TabzChrome && node backend/server.js
```

## Documentation (use /docs-seeker)

| Library | Context7 ID | Use for |
|---------|-------------|---------|
| Streamdown | `/vercel/streamdown` | AI streaming markdown |
| Shiki | `/shikijs/shiki` | Syntax highlighting, CSS themes |
| Tailwind v4 | `/websites/tailwindcss` | Utility classes, @theme |

## Themes

Available themes (30 total, plus Default):
- dark-academia, cyberpunk, parchment, cosmic, noir
- nordic, glassmorphism, film-grain, verdant-grove
- art-deco, knolling, industrial, streamline-moderne, pixel-art
- circuit-board, byzantine, editorial, persian-miniature
- concrete-brutalist, windows31, retro-terminal, swiss-international
- air-traffic-control, japanese-zen, de-stijl, constructivism
- letterpress, risograph, art-nouveau, frutiger-aero

### Adding a New Theme

To port a theme from `~/projects/htmlstyleguides/styles/`:

1. **Create CSS file**: `src/themes/{theme-name}.css`
   ```css
   .theme-{theme-name} {
     /* Required CSS variables */
     --bg-primary: #...;      /* Main background */
     --bg-secondary: #...;    /* Cards, code blocks */
     --text-primary: #...;    /* Main text */
     --text-secondary: #...;  /* Muted text */
     --accent: #...;          /* Links, highlights */
     --border: #...;          /* Borders */
     --radius: 8px;           /* Border radius */

     /* Fonts */
     --font-body: 'Font Name', serif;
     --font-display: 'Display Font', sans-serif;
     --font-mono: 'Mono Font', monospace;
   }

   /* Then add .theme-{name} .prose styles for typography */
   ```

2. **Register theme** in `src/themes/index.ts`:
   ```ts
   import './{theme-name}.css';

   // Add to themes array
   { id: '{theme-name}', name: 'Theme Name', className: 'theme-{theme-name}' }
   ```

3. **Add Shiki CSS variables** for syntax highlighting (in the theme CSS file):
   ```css
   .theme-{theme-name} {
     /* Shiki base colors */
     --shiki-foreground: var(--text-primary);
     --shiki-background: var(--bg-secondary);

     /* Shiki token colors - customize to match theme aesthetic */
     --shiki-token-constant: #...;      /* Constants, numbers */
     --shiki-token-string: #...;        /* String literals */
     --shiki-token-comment: #...;       /* Comments (ensure readable!) */
     --shiki-token-keyword: #...;       /* Keywords (if, const, etc.) */
     --shiki-token-parameter: #...;     /* Function parameters */
     --shiki-token-function: #...;      /* Function names */
     --shiki-token-string-expression: #...;  /* Template literals */
     --shiki-token-punctuation: #...;   /* Brackets, semicolons */
     --shiki-token-link: #...;          /* URLs in code */
   }
   ```

4. **Add fonts** to `src/index.css` Google Fonts import URL

5. **Reference**: Study the HTML file at `~/projects/htmlstyleguides/styles/{theme}.html`
   - Extract color palette from CSS variables
   - Note fonts used (check @import or link tags)
   - Copy texture/pattern techniques (gradients, SVG noise, etc.)
   - Match typography (font sizes, line-height, letter-spacing)

### Shiki CSS Variables

Syntax highlighting uses CSS variables via `createCssVariablesTheme()` from Shiki. Each theme defines its own `--shiki-*` variables to control code colors.

**Tips for choosing colors:**
- `--shiki-token-comment` must have good contrast - comments are often too dark
- For dark themes: use lighter/brighter colors
- For light themes: use darker/saturated colors
- Match the theme's accent colors (e.g., use gold for Art Deco keywords)
- Test with code blocks containing comments, strings, keywords, and functions

**Available token variables:**
| Variable | Used for |
|----------|----------|
| `--shiki-foreground` | Default text color |
| `--shiki-background` | Code block background |
| `--shiki-token-keyword` | `const`, `if`, `return`, etc. |
| `--shiki-token-string` | `"hello"`, `'world'` |
| `--shiki-token-comment` | `// comment`, `/* block */` |
| `--shiki-token-function` | Function names |
| `--shiki-token-constant` | Numbers, booleans, constants |
| `--shiki-token-parameter` | Function parameters |
| `--shiki-token-punctuation` | `{}`, `()`, `;`, `:` |
| `--shiki-token-string-expression` | Template literals |
| `--shiki-token-link` | URLs in comments/strings |

### Catch-All Pre Selector (Important!)

For themes with **dark code blocks**, always add a catch-all selector for `<pre>` elements outside of `.prose` containers. This ensures frontmatter viewers, file viewers, and other code display contexts get proper dark backgrounds instead of inheriting the page's light background.

```css
/* Catch-all for code blocks outside .prose (frontmatter, viewers, etc) */
.theme-{theme-name} pre:not(.prose pre) {
  background: #DARK_BG_COLOR;
  color: #LIGHT_TEXT_COLOR;
}

.theme-{theme-name} pre:not(.prose pre) code {
  background: transparent;
  color: inherit;
}
```

**Also important:** Set `--shiki-background` to the actual dark color, NOT `transparent`. This ensures Shiki-rendered code always gets the correct background:

```css
--shiki-foreground: #LIGHT_COLOR;
--shiki-background: #DARK_COLOR;  /* NOT transparent */
```

Without these rules, code blocks outside `.prose` will show light text (from Shiki) on light backgrounds (from page), causing invisible/hard-to-read code.
