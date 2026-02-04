import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { codeToHtml, bundledLanguages } from 'shiki';
import { createCssVariablesTheme } from 'shiki';
import { useGitDiff, type GitDiffLineType } from '../../hooks/useGitDiff';
import { findAllChangedLines } from '../../utils/markdownDiff';

interface CodeViewerProps {
  content: string;
  filePath: string;
  fontSize?: number;
  isStreaming?: boolean;
  /** Repository root path for git diff highlighting */
  repoPath?: string | null;
}

// Create a single CSS variables theme - colors defined in each theme's CSS
const cssVarsTheme = createCssVariablesTheme({
  name: 'css-variables',
  variablePrefix: '--shiki-',
  variableDefaults: {},
  fontStyle: true,
});

// Map file extensions to Shiki language identifiers
const extensionToLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  mjs: 'javascript',
  cjs: 'javascript',
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
  // Backend
  py: 'python',
  rb: 'ruby',
  php: 'php',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  go: 'go',
  rs: 'rust',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  // Config/Data
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  // Markdown
  md: 'markdown',
  mdx: 'mdx',
  // SQL
  sql: 'sql',
  // Docker
  dockerfile: 'dockerfile',
  // Other
  graphql: 'graphql',
  gql: 'graphql',
  lua: 'lua',
  r: 'r',
  R: 'r',
  perl: 'perl',
  pl: 'perl',
  hs: 'haskell',
  elm: 'elm',
  clj: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  make: 'makefile',
  Makefile: 'makefile',
  cmake: 'cmake',
  vim: 'viml',
  tex: 'latex',
  diff: 'diff',
  prisma: 'prisma',
  astro: 'astro',
};

function getLanguageFromPath(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';

  // Handle special filenames
  if (fileName === 'Dockerfile' || fileName.startsWith('Dockerfile.')) return 'dockerfile';
  if (fileName === 'Makefile' || fileName === 'makefile') return 'makefile';
  if (fileName === '.gitignore' || fileName === '.dockerignore') return 'gitignore';
  if (fileName === '.env' || fileName.startsWith('.env.')) return 'dotenv';

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const lang = extensionToLanguage[ext];

  // Check if the language is available in Shiki
  if (lang && lang in bundledLanguages) {
    return lang;
  }

  // Fallback to plaintext
  return 'text';
}

// Type for combined line highlighting (git diff + recent edit)
interface LineHighlight {
  gitDiff?: GitDiffLineType;
  recentEdit?: boolean;
}

export function CodeViewer({ content, filePath, fontSize = 100, isStreaming = false, repoPath = null }: CodeViewerProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recent edit tracking (streaming-based)
  const [recentEditLines, setRecentEditLines] = useState<Set<number>>(new Set());
  const prevContentRef = useRef<string>('');
  const recentEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Git diff highlighting (temporarily disabled for debugging)
  // const { changedLines: gitChangedLines } = useGitDiff({
  //   filePath,
  //   repoPath,
  //   content, // Trigger refetch on content change
  //   debounceMs: 800, // Slightly longer debounce for git diff
  // });
  const gitChangedLines = new Map<number, GitDiffLineType>();

  const language = useMemo(() => getLanguageFromPath(filePath), [filePath]);
  const lineCount = useMemo(() => content.split('\n').length, [content]);

  // Clear recent edit timer
  const clearRecentEditTimer = useCallback(() => {
    if (recentEditTimerRef.current) {
      clearTimeout(recentEditTimerRef.current);
      recentEditTimerRef.current = null;
    }
  }, []);

  // Track recent edits during streaming
  useEffect(() => {
    if (isStreaming && prevContentRef.current && prevContentRef.current !== content) {
      // Find changed lines
      const result = findAllChangedLines(prevContentRef.current, content);
      const newRecentLines = new Set(result.changedLines.keys());

      if (newRecentLines.size > 0) {
        setRecentEditLines(newRecentLines);

        // Clear any existing timer and set new one to fade the highlight
        clearRecentEditTimer();
        recentEditTimerRef.current = setTimeout(() => {
          setRecentEditLines(new Set());
        }, 2500); // Fade after 2.5 seconds
      }
    }

    // Always update previous content
    prevContentRef.current = content;
  }, [content, isStreaming, clearRecentEditTimer]);

  // Reset recent edit lines when file changes
  useEffect(() => {
    setRecentEditLines(new Set());
    prevContentRef.current = '';
    clearRecentEditTimer();
  }, [filePath, clearRecentEditTimer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      clearRecentEditTimer();
    };
  }, [clearRecentEditTimer]);

  // Combine git diff and recent edit highlights
  const lineHighlights = useMemo(() => {
    const highlights = new Map<number, LineHighlight>();

    // Add git diff highlights
    for (const [lineNum, diffType] of gitChangedLines) {
      highlights.set(lineNum, { gitDiff: diffType });
    }

    // Add recent edit highlights (overlays on top)
    for (const lineNum of recentEditLines) {
      const existing = highlights.get(lineNum) || {};
      highlights.set(lineNum, { ...existing, recentEdit: true });
    }

    return highlights;
  }, [gitChangedLines, recentEditLines]);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      // Don't show loading on content updates - keep showing old content
      // Only show loading on initial render when we have nothing to show
      setError(null);

      try {
        const html = await codeToHtml(content, {
          lang: language,
          theme: cssVarsTheme,
        });

        if (!cancelled) {
          setHighlightedHtml(html);
          setIsInitialLoad(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Shiki highlighting error:', err);
          setError(err instanceof Error ? err.message : 'Failed to highlight code');
          setIsInitialLoad(false);
        }
      }
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [content, language]);

  // Generate line numbers
  const lineNumbers = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => i + 1);
  }, [lineCount]);

  // Get styles for a line based on its highlights
  const getLineStyles = useCallback((lineNum: number): { gutter: React.CSSProperties; content: React.CSSProperties } => {
    const highlight = lineHighlights.get(lineNum);

    const gutterStyle: React.CSSProperties = {};
    const contentStyle: React.CSSProperties = {};

    // Git diff background colors
    if (highlight?.gitDiff === 'added') {
      gutterStyle.backgroundColor = 'var(--diff-added)';
      contentStyle.backgroundColor = 'var(--diff-added)';
    } else if (highlight?.gitDiff === 'modified') {
      gutterStyle.backgroundColor = 'var(--diff-modified)';
      contentStyle.backgroundColor = 'var(--diff-modified)';
    }

    // Recent edit border (accent color on left)
    if (highlight?.recentEdit) {
      contentStyle.borderLeft = '3px solid var(--accent)';
      contentStyle.marginLeft = '-3px'; // Compensate for border width
      contentStyle.transition = 'border-color 0.3s ease-out';
    }

    return { gutter: gutterStyle, content: contentStyle };
  }, [lineHighlights]);

  // Only show loading on initial render, not on content updates
  if (isInitialLoad && !highlightedHtml) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    // Fallback to plain text display
    return (
      <div className="code-viewer h-full overflow-auto" style={{ zoom: fontSize / 100 }}>
        <div className="flex">
          <div
            className="line-numbers select-none text-right pr-4 pl-4 py-4"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              lineHeight: '1.7',
              minWidth: '3rem',
              borderRight: '1px solid var(--border)',
            }}
          >
            {lineNumbers.map((num) => {
              const styles = getLineStyles(num);
              return (
                <div key={num} data-line={num} style={styles.gutter}>
                  {num}
                </div>
              );
            })}
          </div>
          <pre
            className="flex-1 p-4 m-0 overflow-x-auto"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              lineHeight: '1.7',
            }}
          >
            <code>{content}</code>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="code-viewer h-full" style={{ zoom: fontSize / 100 }}>
      <div className="flex">
        <div
          className="line-numbers select-none text-right pr-4 pl-4 py-4 sticky left-0"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            lineHeight: '1.7',
            minWidth: '3rem',
            borderRight: '1px solid var(--border)',
          }}
        >
          {lineNumbers.map((num) => {
            const styles = getLineStyles(num);
            return (
              <div key={num} data-line={num} style={styles.gutter}>
                {num}
              </div>
            );
          })}
        </div>
        <div
          className="code-content flex-1 overflow-x-auto"
          style={{
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <style>{`
            .code-content pre {
              margin: 0;
              padding: 1rem;
              font-family: var(--font-mono);
              font-size: 0.875rem;
              line-height: 1.7;
            }
            .code-content code {
              font-family: inherit;
              font-size: inherit;
              line-height: inherit;
            }
            .code-content .line {
              display: block;
              min-height: 1.7em;
            }
            .code-content .line[data-highlight="added"] {
              background-color: var(--diff-added);
            }
            .code-content .line[data-highlight="modified"] {
              background-color: var(--diff-modified);
            }
            .code-content .line[data-recent-edit="true"] {
              border-left: 3px solid var(--accent);
              margin-left: -3px;
            }
          `}</style>
          <HighlightedCode html={highlightedHtml} lineHighlights={lineHighlights} />
        </div>
      </div>
    </div>
  );
}

/**
 * Component that renders highlighted HTML and applies line-level highlights.
 * We need to post-process the Shiki output to add highlight attributes to lines.
 */
function HighlightedCode({
  html,
  lineHighlights,
}: {
  html: string;
  lineHighlights: Map<number, LineHighlight>;
}) {
  const processedHtml = useMemo(() => {
    if (lineHighlights.size === 0) {
      return html;
    }

    // Shiki outputs <pre><code>...</code></pre> with .line spans
    // We need to add data attributes to each .line span based on line number
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const lines = doc.querySelectorAll('.line');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const highlight = lineHighlights.get(lineNum);

      if (highlight?.gitDiff) {
        line.setAttribute('data-highlight', highlight.gitDiff);
      }
      if (highlight?.recentEdit) {
        line.setAttribute('data-recent-edit', 'true');
      }
    });

    // Get the modified HTML from the pre element
    const pre = doc.querySelector('pre');
    return pre ? pre.outerHTML : html;
  }, [html, lineHighlights]);

  return <div dangerouslySetInnerHTML={{ __html: processedHtml }} />;
}
