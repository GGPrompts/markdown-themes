/**
 * Export markdown viewer content as standalone HTML
 */

import type { ThemeId } from '../themes';

// Map of theme IDs to their CSS variable definitions and extra styles
const themeStyles: Record<ThemeId | 'default', string> = {
  default: `
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --text-primary: #1a1a2e;
  --text-secondary: #4a4a68;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --border: #e5e7eb;
  --font-body: system-ui, -apple-system, sans-serif;
  --font-heading: system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  --radius: 0.5rem;
}
`,
  'dark-academia': `
:root {
  --bg-primary: #1a1915;
  --bg-secondary: #252320;
  --text-primary: #d4c5a9;
  --text-secondary: #a89f8a;
  --accent: #8b7355;
  --accent-hover: #a08567;
  --border: #3d3830;
  --font-body: 'Cormorant Garamond', 'Palatino Linotype', 'Book Antiqua', serif;
  --font-heading: 'Playfair Display', 'Didot', 'Georgia', serif;
  --font-mono: 'Courier Prime', 'Courier New', monospace;
  --radius: 0.25rem;
}

.prose blockquote {
  border-left-color: var(--accent);
  background: linear-gradient(90deg, rgba(139, 115, 85, 0.1), transparent);
  padding: 1rem;
  font-style: italic;
}

.prose hr {
  border-top: 1px solid var(--accent);
  opacity: 0.4;
}

.prose a {
  text-decoration: underline;
  text-underline-offset: 3px;
}
`,
  cyberpunk: `
:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --text-primary: #00ff9f;
  --text-secondary: #00cc7f;
  --accent: #ff00ff;
  --accent-hover: #ff44ff;
  --border: #1f1f2e;
  --font-body: 'Share Tech Mono', 'Consolas', monospace;
  --font-heading: 'Orbitron', 'Share Tech', sans-serif;
  --font-mono: 'Fira Code', 'Source Code Pro', monospace;
  --radius: 0;
}

.prose {
  text-shadow: 0 0 10px rgba(0, 255, 159, 0.3);
}

.prose h1,
.prose h2,
.prose h3 {
  text-shadow: 0 0 20px var(--accent), 0 0 40px var(--accent);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.prose code {
  background: rgba(255, 0, 255, 0.1);
  border: 1px solid rgba(255, 0, 255, 0.3);
  text-shadow: 0 0 5px var(--accent);
}

.prose pre {
  border: 1px solid rgba(0, 255, 159, 0.3);
  box-shadow: 0 0 20px rgba(0, 255, 159, 0.1);
}

.prose a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: all 0.2s;
}

.prose a:hover {
  border-bottom-color: var(--accent);
  text-shadow: 0 0 10px var(--accent);
}
`,
  parchment: `
:root {
  --bg-primary: #f4ecd8;
  --bg-secondary: #ebe3cf;
  --text-primary: #3d3424;
  --text-secondary: #5c5243;
  --accent: #8b4513;
  --accent-hover: #a0522d;
  --border: #d4c9b0;
  --font-body: 'Crimson Text', 'Palatino', 'Georgia', serif;
  --font-heading: 'Cinzel', 'Trajan Pro', serif;
  --font-mono: 'Courier Prime', monospace;
  --radius: 0;
}

body {
  background-image:
    url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
}

.prose h1 {
  text-align: center;
  border-bottom: 2px double var(--accent);
  padding-bottom: 0.5rem;
}

.prose blockquote {
  border-left: 3px solid var(--accent);
  font-style: italic;
  background: rgba(139, 69, 19, 0.05);
}

.prose hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
}

.prose ::first-letter {
  font-size: 1.5em;
  font-weight: bold;
}
`,
  cosmic: `
:root {
  --bg-primary: #0d0d1a;
  --bg-secondary: #151528;
  --text-primary: #e0e6ff;
  --text-secondary: #9ca3cf;
  --accent: #7c3aed;
  --accent-hover: #8b5cf6;
  --border: #2d2d4a;
  --font-body: 'Inter', 'SF Pro Text', system-ui, sans-serif;
  --font-heading: 'Space Grotesk', 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --radius: 0.75rem;
}

body {
  background-image:
    radial-gradient(ellipse at 20% 30%, rgba(124, 58, 237, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
}

.prose h1,
.prose h2 {
  background: linear-gradient(135deg, var(--text-primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.prose code {
  background: rgba(124, 58, 237, 0.15);
  border-radius: 0.25rem;
}

.prose pre {
  background: linear-gradient(135deg, var(--bg-secondary), rgba(124, 58, 237, 0.1));
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.prose a {
  background: linear-gradient(135deg, var(--accent), #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 500;
}
`,
  noir: `
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #141414;
  --text-primary: #e8e8e8;
  --text-secondary: #b0b0b0;
  --accent: #8b0000;
  --accent-hover: #b22222;
  --border: #333333;
  --font-body: 'Courier Prime', 'Courier New', monospace;
  --font-heading: 'Playfair Display', 'Georgia', serif;
  --font-mono: 'Courier Prime', 'Courier New', monospace;
  --radius: 0;
}

.prose h1,
.prose h2,
.prose h3 {
  font-weight: 500;
  letter-spacing: 0.02em;
  text-shadow: 4px 4px 0 #222222;
}

.prose blockquote {
  border-left: 4px solid var(--accent);
  background: linear-gradient(90deg, rgba(139, 0, 0, 0.1), transparent);
  padding: 1rem;
  font-style: italic;
}

.prose hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
}

.prose code {
  background: rgba(139, 0, 0, 0.1);
  border: 1px solid rgba(139, 0, 0, 0.3);
}

.prose pre {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}

.prose a {
  color: var(--accent-hover);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.prose a:hover {
  color: var(--text-primary);
}

.prose strong {
  color: var(--text-primary);
  font-weight: 700;
}
`,
  nordic: `
:root {
  --bg-primary: #fafbfc;
  --bg-secondary: #f5f7f8;
  --text-primary: #1a202c;
  --text-secondary: #4a5568;
  --accent: #c67b5c;
  --accent-hover: #b86d4e;
  --border: #e2e7eb;
  --font-body: 'Nunito Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-heading: 'Playfair Display', 'Georgia', serif;
  --font-mono: 'SF Mono', 'Monaco', monospace;
  --radius: 0.625rem;
}

.prose h1,
.prose h2,
.prose h3 {
  font-weight: 500;
  letter-spacing: -0.01em;
}

.prose blockquote {
  border-left: 3px solid var(--accent);
  background: linear-gradient(90deg, rgba(198, 123, 92, 0.08), transparent);
  padding: 1rem 1.5rem;
  border-radius: var(--radius);
}

.prose hr {
  border: none;
  height: 1px;
  background: var(--border);
}

.prose code {
  background: rgba(198, 123, 92, 0.1);
  border-radius: 0.25rem;
  padding: 0.125rem 0.375rem;
}

.prose pre {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(45, 55, 72, 0.06);
}

.prose a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: rgba(198, 123, 92, 0.4);
  text-underline-offset: 3px;
  transition: text-decoration-color 0.2s;
}

.prose a:hover {
  text-decoration-color: var(--accent);
}
`,
  glassmorphism: `
:root {
  --bg-primary: #0f0c29;
  --bg-secondary: rgba(255, 255, 255, 0.08);
  --text-primary: rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.7);
  --accent: #667eea;
  --accent-hover: #764ba2;
  --border: rgba(255, 255, 255, 0.18);
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-heading: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'Fira Code', 'SF Mono', monospace;
  --radius: 1rem;
}

body {
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
}

.prose h1,
.prose h2 {
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.prose h3 {
  color: var(--text-primary);
  font-weight: 600;
}

.prose blockquote {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  padding: 1rem 1.5rem;
}

.prose hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
}

.prose code {
  background: rgba(102, 126, 234, 0.2);
  border-radius: 0.375rem;
  padding: 0.125rem 0.375rem;
}

.prose pre {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.prose a {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 500;
}

.prose a:hover {
  text-shadow: 0 0 20px rgba(102, 126, 234, 0.5);
}
`,
  'film-grain': `
:root {
  --bg-primary: #faf6ed;
  --bg-secondary: #f5f0e6;
  --text-primary: #3d3a35;
  --text-secondary: #8b7355;
  --accent: #d4a066;
  --accent-hover: #b8864a;
  --border: #b8b2a6;
  --font-body: 'Source Serif 4', Georgia, serif;
  --font-heading: 'Special Elite', 'Courier New', monospace;
  --font-mono: 'DM Mono', 'Courier New', monospace;
  --radius: 2px;
}

.prose h1,
.prose h2,
.prose h3 {
  font-family: var(--font-heading);
  font-weight: 400;
  letter-spacing: 0.02em;
}

.prose blockquote {
  background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  padding: 1rem 1.5rem;
  font-style: italic;
  color: var(--text-secondary);
}

.prose hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border) 20%, var(--border) 80%, transparent);
}

.prose pre {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
}

.prose a {
  color: var(--accent-hover);
  text-decoration: underline;
  text-decoration-color: var(--accent);
}
`,
  'verdant-grove': `
:root {
  --bg-primary: #f4f8f3;
  --bg-secondary: #eff6ef;
  --text-primary: #1f2a24;
  --text-secondary: #6f7f74;
  --accent: #4f8a6e;
  --accent-hover: #315c45;
  --border: rgba(31, 42, 36, 0.14);
  --font-body: 'Karla', 'Inter', sans-serif;
  --font-heading: 'Cormorant Garamond', Georgia, serif;
  --font-mono: 'IBM Plex Mono', 'Consolas', monospace;
  --radius: 10px;
}

.prose h1 { color: #123526; }
.prose h2 { color: #315c45; }
.prose h3 { color: #4f8a6e; }

.prose h1,
.prose h2,
.prose h3 {
  font-family: var(--font-heading);
  font-weight: 600;
}

.prose blockquote {
  background: white;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 0 var(--radius) var(--radius) 0;
  padding: 1.5rem 2rem;
  box-shadow: 0 4px 16px rgba(18, 53, 38, 0.08);
}

.prose hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, #a6c1ae 20%, #a6c1ae 80%, transparent);
}

.prose pre {
  background: white;
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 4px 16px rgba(18, 53, 38, 0.08);
}

.prose a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: #a6c1ae;
}
`,
  'art-deco': `
:root {
  --bg-primary: #0d0d0d;
  --bg-secondary: #1a1a1a;
  --text-primary: #f5f0e1;
  --text-secondary: rgba(245, 240, 225, 0.7);
  --accent: #d4af37;
  --accent-hover: #f4d03f;
  --border: rgba(212, 175, 55, 0.3);
  --font-body: 'Josefin Sans', 'Helvetica Neue', sans-serif;
  --font-heading: 'Poiret One', 'Didot', cursive;
  --font-mono: 'Courier New', monospace;
  --radius: 0;
}

.prose h1,
.prose h2 {
  font-weight: 400;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--accent);
  text-shadow: 0 0 20px rgba(212, 175, 55, 0.3);
}

.prose h3 {
  font-family: var(--font-heading);
  letter-spacing: 0.1em;
  color: var(--accent);
}

.prose blockquote {
  border: 1px solid var(--accent);
  border-left: 4px solid var(--accent);
  background: transparent;
  padding: 1.5rem;
  position: relative;
}

.prose blockquote::before {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  bottom: 4px;
  border: 1px solid rgba(212, 175, 55, 0.3);
  pointer-events: none;
}

.prose hr {
  border: none;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
}

.prose code {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--accent);
}

.prose pre {
  background: var(--bg-secondary);
  border: 1px solid var(--accent);
  position: relative;
}

.prose pre::before {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  bottom: 4px;
  border: 1px solid rgba(212, 175, 55, 0.2);
  pointer-events: none;
}

.prose a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid var(--accent);
  transition: all 0.3s;
}

.prose a:hover {
  color: var(--accent-hover);
  border-bottom-color: var(--accent-hover);
  text-shadow: 0 0 10px rgba(212, 175, 55, 0.5);
}

.prose strong {
  color: var(--accent);
  font-weight: 600;
}
`,
  knolling: `
:root {
  --bg-primary: #1a1a1a;
  --bg-secondary: #252525;
  --text-primary: #f5f5f5;
  --text-secondary: rgba(245, 245, 245, 0.7);
  --accent: #64b5f6;
  --accent-hover: #90caf9;
  --border: rgba(255, 255, 255, 0.1);
  --font-body: 'IBM Plex Sans', sans-serif;
  --font-heading: 'IBM Plex Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --radius: 0;
}
`,
  industrial: `
:root {
  --bg-primary: #1A1D1F;
  --bg-secondary: #252829;
  --text-primary: #E8E4DC;
  --text-secondary: #9BA3A9;
  --accent: #FFB800;
  --accent-hover: #FFD333;
  --border: #4A5459;
  --font-body: 'Oswald', sans-serif;
  --font-heading: 'Oswald', 'Impact', sans-serif;
  --font-mono: 'Share Tech Mono', 'Courier New', monospace;
  --radius: 0;
}

.prose h1 {
  font-family: 'Stencil One', 'Impact', sans-serif;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  text-shadow: 3px 3px 0 #1A1D1F, -1px -1px 0 #B54A24;
}

.prose h2,
.prose h3,
.prose h4 {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-bottom: 4px solid #B54A24;
  padding-bottom: 0.5rem;
}

.prose blockquote {
  border-left: none;
  border: 3px solid var(--border);
  background: var(--bg-secondary);
  padding: 1.5rem;
  position: relative;
}

.prose blockquote::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 8px;
  background: repeating-linear-gradient(
    -45deg,
    var(--accent),
    var(--accent) 10px,
    #1A1D1F 10px,
    #1A1D1F 20px
  );
}

.prose hr {
  border: none;
  height: 6px;
  background: #2C3033;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
}

.prose a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 2px dashed var(--border);
}

.prose a:hover {
  border-bottom-style: solid;
  border-bottom-color: var(--accent);
}

.prose code {
  background: #0D0F10;
  border: 2px solid var(--border);
  color: var(--accent);
}

.prose pre {
  background: #0D0F10;
  border: 3px solid var(--border);
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);
}

.prose strong {
  color: var(--text-primary);
}

.prose em {
  color: #E8823A;
}
`,
  'streamline-moderne': `
:root {
  --bg-primary: #0F1A2E;
  --bg-secondary: #1A2A4A;
  --text-primary: #F5F0E6;
  --text-secondary: rgba(245, 240, 230, 0.75);
  --accent: #7EBDB4;
  --accent-hover: #A5D4CD;
  --border: rgba(192, 192, 192, 0.2);
  --font-body: 'Raleway', 'Inter', sans-serif;
  --font-heading: 'Quicksand', 'Raleway', sans-serif;
  --font-mono: 'Fira Code', monospace;
  --radius: 16px;
}

.prose h1,
.prose h2 {
  font-family: var(--font-heading);
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #E8E8E8;
  text-shadow: 0 0 40px rgba(192, 192, 192, 0.3);
}

.prose h3 {
  font-family: var(--font-heading);
  font-weight: 600;
  letter-spacing: 0.05em;
}

.prose blockquote {
  border-left: 4px solid var(--accent);
  background: var(--bg-secondary);
  border-radius: 0 16px 16px 0;
  padding: 1.5rem 2rem;
}

.prose code {
  background: var(--bg-secondary);
  border: 1px solid rgba(192, 192, 192, 0.15);
  color: var(--accent);
  border-radius: 8px;
}

.prose pre {
  background: var(--bg-secondary);
  border: 1px solid rgba(192, 192, 192, 0.1);
  border-radius: 16px;
}

.prose hr {
  border: none;
  height: 2px;
  background: linear-gradient(90deg, transparent, #A8A8A8 20%, #E8E8E8 50%, #A8A8A8 80%, transparent);
  border-radius: 100px;
  max-width: 70%;
  margin: 3rem auto;
}

.prose a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid rgba(126, 189, 180, 0.4);
  transition: all 0.4s;
}

.prose a:hover {
  color: var(--accent-hover);
  border-bottom-color: var(--accent-hover);
}
`,
  'pixel-art': `
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --text-primary: #fcfcfc;
  --text-secondary: #bcbcbc;
  --accent: #00d4ff;
  --accent-hover: #fcbf00;
  --border: #3c3c3c;
  --font-body: 'VT323', monospace;
  --font-heading: 'Press Start 2P', monospace;
  --font-mono: 'VT323', monospace;
  --radius: 0;
}

body {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  -webkit-font-smoothing: none;
  background-color: #0d0d1a;
}

body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.04) 2px,
    rgba(0, 0, 0, 0.04) 4px
  );
  pointer-events: none;
  z-index: 9999;
}

.prose {
  font-size: 1.25rem;
}

.prose h1,
.prose h2,
.prose h3 {
  font-family: 'Press Start 2P', monospace;
  text-transform: uppercase;
  letter-spacing: 2px;
  line-height: 1.6;
}

.prose h1 {
  font-size: 1.5rem;
  color: #00d4ff;
  text-shadow: 4px 4px 0 #0077c0, 8px 8px 0 #16213e;
  border-bottom: 4px solid #3c3c3c;
  padding-bottom: 12px;
}

.prose h2 {
  font-size: 1rem;
  color: #fcbf00;
  text-shadow: 2px 2px 0 #ff7700;
  border-left: 4px solid #fcbf00;
  padding-left: 12px;
}

.prose h3 {
  font-size: 0.75rem;
  color: #7cfc00;
  text-shadow: 2px 2px 0 #00a854;
}

.prose a {
  color: #00d4ff;
  text-decoration: none;
  border-bottom: 2px solid transparent;
}

.prose a:hover {
  color: #fcbf00;
  border-bottom-color: #fcbf00;
}

.prose code {
  font-family: 'VT323', monospace;
  background: #0f0f0f;
  color: #7cfc00;
  padding: 2px 8px;
  border: 2px solid #3c3c3c;
  box-shadow: inset 2px 2px 0 0 #000, inset -2px -2px 0 0 #7c7c7c;
}

.prose pre {
  background: #0f0f0f;
  border: 4px solid #3c3c3c;
  box-shadow: inset 4px 4px 0 0 #000, inset -4px -4px 0 0 #7c7c7c, 8px 8px 0 0 #0f0f0f;
}

.prose pre code {
  color: #7cfc00;
  box-shadow: none;
  border: none;
  background: transparent;
}

.prose blockquote {
  background: #fcfcfc;
  color: #0f0f0f;
  border: 4px solid #0f0f0f;
  border-left: 4px solid #0f0f0f;
  box-shadow: inset -4px -4px 0 0 #bcbcbc, inset 4px 4px 0 0 #fcfcfc, 8px 8px 0 0 #0f0f0f;
  padding: 16px;
}

.prose hr {
  border: none;
  height: 8px;
  background: repeating-linear-gradient(
    90deg,
    #00d4ff 0px,
    #00d4ff 8px,
    transparent 8px,
    transparent 16px,
    #fcbf00 16px,
    #fcbf00 24px,
    transparent 24px,
    transparent 32px
  );
}

.prose strong {
  color: #00d4ff;
}

.prose em {
  color: #ff6b9d;
}
`,
  'circuit-board': `
:root {
  --bg-primary: #0F2D1A;
  --bg-secondary: #1A472A;
  --text-primary: #F5F5F0;
  --text-secondary: #C8C8C0;
  --accent: #B87333;
  --accent-hover: #D4956A;
  --border: #8B5A2B;
  --font-body: 'JetBrains Mono', 'Consolas', monospace;
  --font-heading: 'Share Tech Mono', 'Courier New', monospace;
  --font-mono: 'JetBrains Mono', 'Consolas', monospace;
  --radius: 0;
}

.prose h1, .prose h2, .prose h3 {
  color: #B87333;
  font-family: 'Share Tech Mono', monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.prose code {
  background: #2D2D2D;
  color: #33FF33;
  border: 1px solid #B87333;
}

.prose pre {
  background: #2D2D2D;
  border: 1px solid #B87333;
}
`,
  byzantine: `
:root {
  --bg-primary: #1a1410;
  --bg-secondary: #2a2218;
  --text-primary: #f5f0e1;
  --text-secondary: rgba(245, 240, 225, 0.75);
  --accent: #d4a012;
  --accent-hover: #f0c848;
  --border: rgba(212, 160, 18, 0.4);
  --font-body: 'Cormorant Garamond', 'Palatino Linotype', serif;
  --font-heading: 'Cinzel', 'Trajan Pro', serif;
  --font-mono: 'Fira Code', 'Consolas', monospace;
  --radius: 2px;
}

.prose h1, .prose h2, .prose h3 {
  color: var(--accent);
  font-family: 'Cinzel', serif;
  text-shadow: 0 0 10px rgba(212, 160, 18, 0.3);
}

.prose blockquote {
  border-left: 4px solid var(--accent);
  background: rgba(212, 160, 18, 0.1);
}

.prose code {
  background: #1c1812;
  color: var(--accent);
}

.prose pre {
  background: #1c1812;
  border: 1px solid var(--accent);
}
`,
  editorial: `
:root {
  --bg-primary: #FAF8F5;
  --bg-secondary: #F5F2ED;
  --text-primary: #1A1A1A;
  --text-secondary: #4A4A4A;
  --accent: #8B0000;
  --accent-hover: #A31515;
  --border: #D4D0C8;
  --font-body: 'Source Serif 4', Georgia, serif;
  --font-heading: 'Playfair Display', Georgia, serif;
  --font-mono: 'Courier Prime', Courier, monospace;
  --radius: 0;
}

.prose h1 {
  font-size: 2.5rem;
  border-bottom: 2px solid var(--accent);
}

.prose h1::first-letter {
  font-size: 4rem;
  float: left;
  line-height: 1;
  margin-right: 0.5rem;
  color: var(--accent);
}

.prose blockquote {
  border-left: 3px solid var(--accent);
  font-style: italic;
}
`,
  'persian-miniature': `
:root {
  --bg-primary: #f5ece0;
  --bg-secondary: #e8dcc8;
  --text-primary: #0f2442;
  --text-secondary: rgba(15, 36, 66, 0.75);
  --accent: #d4a84b;
  --accent-hover: #f0c75e;
  --border: #d4a84b;
  --font-body: 'Cormorant Garamond', Georgia, serif;
  --font-heading: 'Cinzel', 'Palatino Linotype', serif;
  --font-mono: 'Cousine', 'Courier New', monospace;
  --radius: 0;
}

.prose h1, .prose h2, .prose h3 {
  color: var(--accent);
  font-family: 'Cinzel Decorative', serif;
  border-bottom: 2px solid var(--accent);
}

.prose blockquote {
  border: 2px solid var(--accent);
  background: rgba(212, 168, 75, 0.1);
}

.prose code {
  background: #0f2442;
  color: #f0c75e;
}

.prose pre {
  background: #0f2442;
  color: #f5ece0;
  border: 2px solid var(--accent);
}
`,
  'concrete-brutalist': `
:root {
  --bg-primary: #2D2D28;
  --bg-secondary: #4A4A42;
  --text-primary: #F5F5F0;
  --text-secondary: #C4C4BC;
  --accent: #F4A100;
  --accent-hover: #FFB81C;
  --border: #6B6A5E;
  --font-body: 'IBM Plex Sans', Arial, sans-serif;
  --font-heading: 'Oswald', Impact, sans-serif;
  --font-mono: 'IBM Plex Mono', 'Courier New', monospace;
  --radius: 0;
}

.prose h1, .prose h2 {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
  font-weight: 700;
}

.prose blockquote {
  border-left: 8px solid var(--accent);
  background: #4A4A42;
}

.prose code {
  background: #1C1C1A;
  color: var(--accent);
}

.prose pre {
  background: #1C1C1A;
  border-left: 4px solid var(--accent);
}
`,
  windows31: `
:root {
  --bg-primary: #C0C0C0;
  --bg-secondary: #FFFFFF;
  --text-primary: #000000;
  --text-secondary: #808080;
  --accent: #000080;
  --accent-hover: #0000FF;
  --border: #808080;
  --font-body: 'Segoe UI', Tahoma, sans-serif;
  --font-heading: 'Segoe UI', Tahoma, sans-serif;
  --font-mono: 'Consolas', 'Courier New', monospace;
  --radius: 0;
}

.prose {
  background: var(--bg-secondary);
  border: 2px solid;
  border-color: #FFFFFF #808080 #808080 #FFFFFF;
  box-shadow: inset 1px 1px 0 #DFDFDF, inset -1px -1px 0 #808080;
  padding: 2rem;
}

.prose h1, .prose h2, .prose h3 {
  color: var(--accent);
}

.prose code {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}

.prose pre {
  background: var(--bg-secondary);
  border: 2px solid;
  border-color: #808080 #FFFFFF #FFFFFF #808080;
}
`,
  'retro-terminal': `
:root {
  --bg-primary: #000a00;
  --bg-secondary: #001100;
  --text-primary: #33ff33;
  --text-secondary: #00cc00;
  --accent: #00ff00;
  --accent-hover: #33ff33;
  --border: #009900;
  --font-body: 'IBM Plex Mono', monospace;
  --font-heading: 'VT323', monospace;
  --font-mono: 'Fira Code', 'IBM Plex Mono', monospace;
  --radius: 0;
}

.prose {
  text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
}

.prose h1, .prose h2 {
  font-family: 'VT323', monospace;
  text-shadow: 0 0 10px var(--accent);
}

.prose code {
  background: var(--bg-secondary);
  color: var(--accent);
  text-shadow: 0 0 5px var(--accent);
}

.prose pre {
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  box-shadow: 0 0 10px rgba(0, 255, 0, 0.2);
}

.prose a {
  color: #ffb000;
}
`,
  'swiss-international': `
:root {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F5F5F5;
  --text-primary: #000000;
  --text-secondary: #404040;
  --accent: #E30613;
  --accent-hover: #B80510;
  --border: #D4D4D4;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-heading: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  --radius: 0;
}

.prose h1 {
  font-weight: 700;
  letter-spacing: -0.02em;
  border-left: 4px solid var(--accent);
  padding-left: 1rem;
}

.prose h2 {
  font-weight: 600;
  color: var(--accent);
}

.prose blockquote {
  border-left: 4px solid var(--accent);
  background: var(--bg-secondary);
}

.prose a {
  color: var(--accent);
  text-decoration: underline;
}
`,
  'air-traffic-control': `
:root {
  --bg-primary: #0a0f0a;
  --bg-secondary: #0a100a;
  --text-primary: #00ff66;
  --text-secondary: #00cc52;
  --accent: #00ff66;
  --accent-hover: #66ffaa;
  --border: rgba(0, 255, 102, 0.2);
  --font-body: 'IBM Plex Mono', Consolas, monospace;
  --font-heading: 'Orbitron', 'Arial Black', sans-serif;
  --font-mono: 'Share Tech Mono', 'IBM Plex Mono', monospace;
  --radius: 0;
}

.prose {
  text-shadow: 0 0 3px rgba(0, 255, 102, 0.5);
}

.prose h1, .prose h2 {
  font-family: 'Orbitron', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  text-shadow: 0 0 10px rgba(0, 255, 102, 0.6);
}

.prose code {
  background: #000000;
  color: var(--accent);
  border: 1px solid var(--border);
}

.prose pre {
  background: #000000;
  border: 1px solid var(--accent);
  box-shadow: 0 0 15px rgba(0, 255, 102, 0.2);
}

.prose a {
  color: #ffaa00;
}
`,
  'japanese-zen': `
:root {
  --bg-primary: #F5F2EB;
  --bg-secondary: #FAFAF7;
  --text-primary: #2D2D2D;
  --text-secondary: #4D4D4D;
  --accent: #8B9A6B;
  --accent-hover: #6B7A4B;
  --border: #D4D4D4;
  --font-body: 'Noto Serif JP', Georgia, serif;
  --font-heading: 'Noto Serif JP', Georgia, serif;
  --font-mono: 'JetBrains Mono', monospace;
  --radius: 2px;
}

.prose h1, .prose h2 {
  font-weight: 400;
  letter-spacing: 0.1em;
  color: var(--text-primary);
}

.prose blockquote {
  border-left: 2px solid var(--accent);
  background: transparent;
  font-style: italic;
}

.prose hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
}

.prose code {
  background: #EDE8DE;
}

.prose pre {
  background: #EDE8DE;
  border: 1px solid var(--border);
}
`,
  'de-stijl': `
:root {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8F8F8;
  --text-primary: #000000;
  --text-secondary: #333333;
  --accent: #D40920;
  --accent-hover: #B00718;
  --border: #000000;
  --font-body: 'Work Sans', 'Helvetica Neue', sans-serif;
  --font-heading: 'Work Sans', 'Helvetica Neue', sans-serif;
  --font-mono: 'IBM Plex Mono', Consolas, monospace;
  --radius: 0;
}

.prose h1 {
  border-left: 8px solid var(--accent);
  padding-left: 1rem;
  font-weight: 900;
  text-transform: uppercase;
}

.prose h2 {
  border-left: 4px solid #1356A2;
  padding-left: 0.75rem;
  font-weight: 700;
}

.prose blockquote {
  border: 4px solid #000000;
  border-left: 8px solid #F7D117;
  background: #F8F8F8;
}

.prose code {
  background: #F8F8F8;
  border: 2px solid #000000;
}

.prose pre {
  background: #F8F8F8;
  border: 4px solid #000000;
  box-shadow: 4px 4px 0 #000000;
}
`,
  constructivism: `
:root {
  --bg-primary: #E8E4DC;
  --bg-secondary: #F5F5F0;
  --text-primary: #0A0A0A;
  --text-secondary: #4A4A4A;
  --accent: #CC0000;
  --accent-hover: #E52222;
  --border: #0A0A0A;
  --font-body: 'Roboto Condensed', 'Arial Narrow', sans-serif;
  --font-heading: 'Oswald', 'Arial Narrow', sans-serif;
  --font-mono: 'Share Tech Mono', 'Courier New', monospace;
  --radius: 0;
}

.prose h1, .prose h2 {
  font-family: 'Bebas Neue', Impact, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent);
}

.prose blockquote {
  border-left: 8px solid var(--accent);
  background: #F5F5F0;
  transform: skewX(-2deg);
}

.prose code {
  background: #0A0A0A;
  color: #F5F5F0;
}

.prose pre {
  background: #0A0A0A;
  color: #F5F5F0;
  border-left: 4px solid var(--accent);
}
`,
  letterpress: `
:root {
  --bg-primary: #F5ECD7;
  --bg-secondary: #E8DCC6;
  --text-primary: #2A2520;
  --text-secondary: #3D3229;
  --accent: #8B0000;
  --accent-hover: #722F37;
  --border: #3D3229;
  --font-body: 'Lora', Georgia, serif;
  --font-heading: 'Playfair Display', Georgia, serif;
  --font-mono: 'EB Garamond', 'Times New Roman', serif;
  --radius: 0;
}

.prose h1, .prose h2 {
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.1), -1px -1px 0 rgba(255, 255, 255, 0.3);
}

.prose blockquote {
  border-left: 4px solid var(--accent);
  background: rgba(139, 0, 0, 0.05);
}

.prose code {
  background: #EDE4D0;
  color: var(--accent);
}

.prose pre {
  background: #EDE4D0;
  border: 1px solid var(--border);
}
`,
  risograph: `
:root {
  --bg-primary: #F5F0E1;
  --bg-secondary: #FDF6E3;
  --text-primary: #1A1A2E;
  --text-secondary: #3D3D5C;
  --accent: #FF006E;
  --accent-hover: #FF3D8E;
  --border: #1A1A2E;
  --font-body: 'DM Sans', 'Helvetica Neue', sans-serif;
  --font-heading: 'Space Mono', 'Courier New', monospace;
  --font-mono: 'Space Mono', 'Courier New', monospace;
  --radius: 0;
}

.prose h1, .prose h2 {
  font-family: 'Space Mono', monospace;
  text-transform: uppercase;
  color: var(--accent);
}

.prose blockquote {
  border: 3px solid var(--accent);
  background: #FDF6E3;
  box-shadow: 3px 3px 0 #2EC4B6;
}

.prose code {
  background: #FDF6E3;
  border: 2px solid var(--border);
}

.prose pre {
  background: #FDF6E3;
  border: 3px solid var(--border);
  box-shadow: 4px 4px 0 var(--accent);
}
`,
  'art-nouveau': `
:root {
  --bg-primary: #F5F0E6;
  --bg-secondary: #FFFEF5;
  --text-primary: #2D2A26;
  --text-secondary: #524F4A;
  --accent: #C9A227;
  --accent-hover: #E0C35C;
  --border: rgba(201, 162, 39, 0.3);
  --font-body: 'Cormorant Garamond', Georgia, serif;
  --font-heading: 'Playfair Display', Georgia, serif;
  --font-mono: 'Fira Code', monospace;
  --radius: 8px;
}

.prose h1, .prose h2 {
  color: var(--accent);
  font-style: italic;
}

.prose h1::first-letter {
  font-size: 3rem;
  float: left;
  line-height: 1;
  margin-right: 0.5rem;
  color: #6B2D3C;
}

.prose blockquote {
  border-left: 4px solid var(--accent);
  background: rgba(201, 162, 39, 0.1);
  border-radius: 0 8px 8px 0;
}

.prose code {
  background: #EDE5D8;
}

.prose pre {
  background: #EDE5D8;
  border: 1px solid var(--accent);
  border-radius: 8px;
}
`,
  'frutiger-aero': `
:root {
  --bg-primary: #e8f4fc;
  --bg-secondary: rgba(255, 255, 255, 0.8);
  --text-primary: #1a3a4a;
  --text-secondary: #4a6a7a;
  --accent: #3a9fd5;
  --accent-hover: #7ec8f0;
  --border: rgba(255, 255, 255, 0.9);
  --font-body: 'Source Sans Pro', 'Segoe UI', sans-serif;
  --font-heading: 'Source Sans Pro', 'Segoe UI', sans-serif;
  --font-mono: Consolas, Monaco, monospace;
  --radius: 12px;
}

body {
  background: linear-gradient(180deg, #1a6fa5 0%, #3a9fd5 30%, #7ec8f0 60%, #c5e8f7 100%);
}

.prose {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 8px 32px rgba(0, 80, 140, 0.15);
}

.prose h1, .prose h2 {
  color: var(--accent);
}

.prose blockquote {
  background: rgba(255, 255, 255, 0.9);
  border-left: 4px solid var(--accent);
  border-radius: 0 12px 12px 0;
}

.prose code {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 6px;
}

.prose pre {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 80, 140, 0.1);
}
`,
};

// Google Fonts URLs for each theme
const themeFonts: Record<ThemeId | 'default', string[]> = {
  default: [],
  'dark-academia': [
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Playfair+Display:wght@400;600;700&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap',
  ],
  cyberpunk: [
    'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700&family=Fira+Code:wght@400;500&display=swap',
  ],
  parchment: [
    'https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Cinzel:wght@400;600;700&family=Courier+Prime:wght@400;700&display=swap',
  ],
  cosmic: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  ],
  noir: [
    'https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Playfair+Display:wght@400;500;600&display=swap',
  ],
  nordic: [
    'https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,400;0,600;1,400&family=Playfair+Display:wght@400;500;600&display=swap',
  ],
  glassmorphism: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap',
  ],
  'film-grain': [
    'https://fonts.googleapis.com/css2?family=Special+Elite&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@400;500&display=swap',
  ],
  'verdant-grove': [
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Karla:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
  ],
  'art-deco': [
    'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;600;700&family=Poiret+One&display=swap',
  ],
  knolling: [
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
  ],
  industrial: [
    'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Share+Tech+Mono&family=Stencil+One&display=swap',
  ],
  'streamline-moderne': [
    'https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600&family=Quicksand:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap',
  ],
  'pixel-art': [
    'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap',
  ],
  'circuit-board': [
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Share+Tech+Mono&family=Orbitron:wght@400;500;600&display=swap',
  ],
  byzantine: [
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Fira+Code:wght@400;500&display=swap',
  ],
  editorial: [
    'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Courier+Prime:wght@400;700&display=swap',
  ],
  'persian-miniature': [
    'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&family=Cinzel:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Cousine:wght@400;700&display=swap',
  ],
  'concrete-brutalist': [
    'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
  ],
  windows31: [
    'https://fonts.googleapis.com/css2?family=VT323&display=swap',
  ],
  'retro-terminal': [
    'https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500;600;700&family=Fira+Code:wght@400;500;600;700&display=swap',
  ],
  'swiss-international': [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  ],
  'air-traffic-control': [
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;800&family=Share+Tech+Mono&display=swap',
  ],
  'japanese-zen': [
    'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  ],
  'de-stijl': [
    'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Work+Sans:wght@400;500;600;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap',
  ],
  constructivism: [
    'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;500;600;700&family=Roboto+Condensed:wght@400;500;600;700&family=Share+Tech+Mono&display=swap',
  ],
  letterpress: [
    'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap',
  ],
  risograph: [
    'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap',
  ],
  'art-nouveau': [
    'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Fira+Code:wght@400;500&display=swap',
  ],
  'frutiger-aero': [
    'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@400;600;700&display=swap',
  ],
};

// Base prose styles that work across all themes
const baseProseStyles = `
/* Base prose styles */
body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body);
  margin: 0;
  padding: 0;
}

article.prose {
  max-width: 65ch;
  margin: 0 auto;
  padding: 2rem;
  line-height: 1.75;
}

.prose h1 {
  font-size: 2.25rem;
  font-weight: 700;
  margin-top: 0;
  margin-bottom: 1rem;
  line-height: 1.2;
  font-family: var(--font-heading);
  color: var(--text-primary);
}

.prose h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  line-height: 1.3;
  font-family: var(--font-heading);
  color: var(--text-primary);
}

.prose h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  line-height: 1.4;
  font-family: var(--font-heading);
  color: var(--text-primary);
}

.prose h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  font-family: var(--font-heading);
  color: var(--text-primary);
}

.prose p {
  margin-top: 1.25rem;
  margin-bottom: 1.25rem;
}

.prose p:first-child {
  margin-top: 0;
}

.prose a {
  color: var(--accent);
  text-decoration: underline;
}

.prose strong {
  font-weight: 600;
  color: var(--text-primary);
}

.prose em {
  font-style: italic;
}

.prose ul, .prose ol {
  margin-top: 1.25rem;
  margin-bottom: 1.25rem;
  padding-left: 1.5rem;
}

.prose li {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.prose li::marker {
  color: var(--text-secondary);
}

.prose ol > li::marker {
  color: var(--text-secondary);
}

.prose blockquote {
  font-style: italic;
  border-left: 4px solid var(--accent);
  margin: 1.5rem 0;
  padding: 0.5rem 1rem;
  color: var(--text-secondary);
}

.prose hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 2rem 0;
}

.prose code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  color: var(--accent);
  background-color: var(--bg-secondary);
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
}

.prose pre {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 1.7;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  overflow-x: auto;
  margin: 1.5rem 0;
}

.prose pre code {
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

.prose img {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius);
  margin: 1.5rem 0;
}

.prose table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
}

.prose th, .prose td {
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.prose th {
  background-color: var(--bg-secondary);
  font-weight: 600;
}

.prose tr:nth-child(even) {
  background-color: var(--bg-secondary);
}

/* Shiki code block overrides */
.prose pre.shiki {
  background-color: var(--bg-secondary) !important;
}

.prose .shiki code {
  font-family: var(--font-mono);
  background: transparent;
}
`;

export interface ExportOptions {
  /** The rendered HTML content from the markdown viewer */
  renderedHtml: string;
  /** Current theme ID */
  themeId: ThemeId;
  /** Document title (usually the filename) */
  title: string;
}

/**
 * Generate a complete standalone HTML document with embedded styles
 */
export function generateHtml({ renderedHtml, themeId, title }: ExportOptions): string {
  const themeStyle = themeStyles[themeId] || themeStyles.default;
  const fonts = themeFonts[themeId] || themeFonts.default;

  const fontLinks = fonts
    .map((url) => `<link rel="stylesheet" href="${url}">`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    ${fontLinks}
    <style>
${themeStyle}
${baseProseStyles}
    </style>
</head>
<body>
    <article class="prose">
${renderedHtml}
    </article>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
