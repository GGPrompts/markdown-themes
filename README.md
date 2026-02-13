# Markdown Themes

A themed markdown viewer for AI-assisted writing. Watch Claude edit files in real-time with beautiful style guide themes.

## Features

- **Live file watching** — See changes as Claude writes, with streaming detection and auto-scroll
- **30+ themes** — Dark Academia, Cyberpunk, Art Deco, Nordic, and many more
- **Git integration** — Commit graph, working tree, diff highlighting on edited lines
- **Built-in terminal** — Tabbed xterm.js terminals with theme-matched color schemes
- **AI chat panel** — Stream Claude responses via SSE with multi-conversation tabs
- **Prompty editor** — Render `.prompty` files with inline editable `{{variable}}` fields
- **Multi-format viewer** — Markdown, code (Shiki), JSON, CSV, images, PDF, video, audio, SVG

## Stack

| Layer | Tech |
|-------|------|
| Backend | Go (Chi router, SQLite, fsnotify, WebSocket) |
| Frontend | React 19, Tailwind v4, Vite |
| Markdown | Streamdown (Vercel) |
| Syntax | Shiki with CSS variable themes |
| Terminal | xterm.js with WebSocket PTY |

## Quick Start

```bash
# 1. Start the Go backend (port 8130)
cd backend && go run .

# 2. Start the frontend dev server
npm install
npm run dev

# 3. Open http://localhost:5173
```

## Architecture

```
WSL (Go backend @ 8130)             Browser (Chrome)
┌───────────────────────────────┐   ┌─────────────────────┐
│  /api/files/tree              │   │  markdown-themes     │
│  /api/files/content           │◄─►│  - Streamdown        │
│  /api/git/* endpoints         │   │  - 30+ CSS Themes    │
│  /api/chat/* (SSE + CRUD)     │   │  - AI Chat (SSE)     │
│  /api/terminal/* (WebSocket)  │   │  - xterm.js Terminal  │
│  SQLite (conversations.db)    │   │                      │
│  WebSocket file-watch msgs    │   │                      │
└───────────────────────────────┘   └──────────────────────┘
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Show all shortcuts |
| `/` | Focus sidebar search |
| `Ctrl+B` or `Alt+[` | Toggle sidebar |
| `Ctrl+\` | Toggle split view |
| `Ctrl+G` | Toggle git graph |
| `Ctrl+Shift+G` | Toggle working tree |
| `Ctrl+Shift+C` or `Alt+]` | Toggle AI chat |
| `` Ctrl+` `` | Toggle terminal |

## License

MIT
