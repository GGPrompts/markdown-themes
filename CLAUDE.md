# Markdown Themes

A themed markdown viewer for AI-assisted writing. Watch Claude edit files in real-time with beautiful style guide themes.

## Stack

- **TabzChrome Backend** - File watching via WebSocket (port 8129)
- **React 19** - UI
- **Tailwind v4** - CSS-based config with `@theme` directive
- **Streamdown** - Vercel's react-markdown replacement for AI streaming
- **Shiki** - Syntax highlighting (via @streamdown/code)

## Architecture

```
WSL (TabzChrome backend @ 8129)     Browser (Chrome)
┌───────────────────────────────┐   ┌─────────────────────┐
│  /api/files/tree              │   │  markdown-themes    │
│  /api/files/content           │◄─►│  - Streamdown       │
│  WebSocket file-watch msgs    │   │  - Themes (CSS)     │
└───────────────────────────────┘   └─────────────────────┘
```

**Requires**: TabzChrome backend running on port 8129

## Project Structure

```
src/
├── App.tsx                    # Main app, theme state
├── index.css                  # Tailwind + CSS variables
├── lib/
│   └── api.ts                 # TabzChrome API client + WebSocket
├── components/
│   ├── MarkdownViewer.tsx     # Streamdown renderer
│   ├── ThemeSelector.tsx      # Theme dropdown
│   ├── Toolbar.tsx            # Path input, streaming indicator
│   ├── Sidebar.tsx            # File tree navigation
│   └── MetadataBar.tsx        # Frontmatter display
├── hooks/
│   ├── useFileWatcher.ts      # WebSocket file watching + streaming detection
│   ├── useWorkspace.ts        # File tree via TabzChrome API
│   └── useAppStore.ts         # localStorage persistence
├── utils/
│   └── frontmatter.ts         # YAML frontmatter parser
└── themes/
    ├── index.ts               # Theme registry (9 themes)
    └── *.css                  # Theme CSS files
```

## Key Concepts

### File Watching (WebSocket)
`useFileWatcher` connects to TabzChrome's WebSocket and subscribes to file changes:
- Sends `{ type: 'file-watch', path }` to subscribe
- Receives `{ type: 'file-change', content, timeSinceLastChange }` on changes
- Streaming detection: `timeSinceLastChange < 1500ms` triggers streaming UI

### Streaming Detection
When rapid file changes are detected (< 1.5s apart):
- Streamdown's `caret="block"` shows typing cursor
- "AI writing..." indicator in toolbar
- `parseIncompleteMarkdown` for mid-stream rendering

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

## Commands

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

## Prerequisites

1. TabzChrome backend must be running:
   ```bash
   cd ~/projects/TabzChrome && node backend/server.js
   ```

2. Open http://localhost:5173 in browser

## Documentation (use /docs-seeker)

| Library | Context7 ID | Use for |
|---------|-------------|---------|
| Streamdown | `/vercel/streamdown` | AI streaming markdown |
| Shiki | `/shikijs/shiki` | Syntax highlighting, CSS themes |
| Tailwind v4 | `/websites/tailwindcss` | Utility classes, @theme |

## Themes

Available themes (from htmlstyleguides):
- dark-academia, cyberpunk, parchment, cosmic
- noir, nordic, glassmorphism
- art-deco, editorial

Port more from `~/projects/htmlstyleguides/styles/`.
