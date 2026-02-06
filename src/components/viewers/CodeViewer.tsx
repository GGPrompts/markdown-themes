import { useEffect, useState, useMemo, useRef, useCallback, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { codeToHtml, bundledLanguages } from 'shiki';
import { createCssVariablesTheme } from 'shiki';
import { useGitDiff, type GitDiffLineType, type DeletedLine } from '../../hooks/useGitDiff';
import { findAllChangedLines } from '../../utils/markdownDiff';

interface CodeViewerProps {
  content: string;
  filePath: string;
  fontSize?: number;
  isStreaming?: boolean;
  /** Repository root path for git diff highlighting */
  repoPath?: string | null;
  /** Ref to the parent scroll container for sticky scrollbar markers */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
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

export function CodeViewer({ content, filePath, fontSize = 100, isStreaming = false, repoPath = null, scrollContainerRef }: CodeViewerProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recent edit tracking (streaming-based)
  const [recentEditLines, setRecentEditLines] = useState<Set<number>>(new Set());
  const prevContentRef = useRef<string>('');
  const recentEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Git diff highlighting - disabled during streaming to avoid render thrashing
  const { changedLines: gitChangedLines, deletedLines: gitDeletedLines } = useGitDiff({
    filePath,
    repoPath,
    content, // Trigger refetch on content change
    debounceMs: 1000, // Longer debounce to avoid rapid refetches
    enabled: !isStreaming, // Disable during streaming
  });

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

  // Generate display lines (actual line numbers + deleted line markers)
  type DisplayLine = { type: 'actual'; lineNum: number } | { type: 'deleted' };

  const displayLines = useMemo(() => {
    const lines: DisplayLine[] = [];

    // Group deleted lines by their afterLine position
    const deletionsByPosition = new Map<number, number>(); // afterLine -> count
    for (const del of gitDeletedLines) {
      deletionsByPosition.set(del.afterLine, (deletionsByPosition.get(del.afterLine) || 0) + 1);
    }

    // Build display lines array
    for (let i = 1; i <= lineCount; i++) {
      // Check for deletions before this line (afterLine = i - 1)
      const deletionsBeforeThis = deletionsByPosition.get(i - 1) || 0;
      for (let d = 0; d < deletionsBeforeThis; d++) {
        lines.push({ type: 'deleted' });
      }
      lines.push({ type: 'actual', lineNum: i });
    }

    // Add any deletions after the last line
    const deletionsAtEnd = deletionsByPosition.get(lineCount) || 0;
    for (let d = 0; d < deletionsAtEnd; d++) {
      lines.push({ type: 'deleted' });
    }

    return lines;
  }, [lineCount, gitDeletedLines]);

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
            {Array.from({ length: lineCount }, (_, i) => i + 1).map((num) => {
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
    <div className="code-viewer h-full" style={{ zoom: fontSize / 100, position: 'relative' }}>
      <ScrollbarMarkers changedLines={gitChangedLines} deletedLines={gitDeletedLines} totalLines={lineCount} scrollContainerRef={scrollContainerRef} />
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
          {displayLines.map((line, idx) => {
            if (line.type === 'deleted') {
              return (
                <div
                  key={`del-${idx}`}
                  style={{
                    backgroundColor: 'var(--diff-deleted, rgba(239, 68, 68, 0.25))',
                    color: 'var(--text-secondary)',
                  }}
                >
                  −
                </div>
              );
            }
            const styles = getLineStyles(line.lineNum);
            return (
              <div key={line.lineNum} data-line={line.lineNum} style={styles.gutter}>
                {line.lineNum}
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
            .code-content .deleted-line {
              display: block;
              min-height: 1.7em;
              background-color: var(--diff-deleted, rgba(239, 68, 68, 0.25));
              color: var(--text-secondary);
              text-decoration: line-through;
              opacity: 0.8;
            }
          `}</style>
          <HighlightedCode html={highlightedHtml} lineHighlights={lineHighlights} deletedLines={gitDeletedLines} />
        </div>
      </div>
    </div>
  );
}

/**
 * Scrollbar-style diff markers overlay.
 * Renders colored tick marks on the right edge of the scroll container's
 * scrollbar track, showing where diffs are located (like VS Code's minimap markers).
 *
 * Uses position:sticky so the markers stay fixed in the viewport while
 * content scrolls beneath them. The marker container floats right and
 * overlaps the scrollbar track area.
 */
function ScrollbarMarkers({
  changedLines,
  deletedLines,
  totalLines,
  scrollContainerRef,
}: {
  changedLines: Map<number, GitDiffLineType>;
  deletedLines: DeletedLine[];
  totalLines: number;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}) {
  const [containerHeight, setContainerHeight] = useState(0);

  // Track the scroll container's visible height so markers map to the scrollbar track
  useEffect(() => {
    const el = scrollContainerRef?.current;
    if (!el) return;

    const updateHeight = () => {
      setContainerHeight(el.clientHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  const handleClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const lineNum = e.currentTarget.dataset.markerLine;
    if (!lineNum) return;
    const target = document.querySelector(`[data-line="${lineNum}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Build marker entries from changedLines and deletedLines
  const markers = useMemo(() => {
    const result: Array<{ line: number; type: 'added' | 'modified' | 'deleted' }> = [];

    for (const [lineNum, diffType] of changedLines) {
      result.push({ line: lineNum, type: diffType });
    }

    for (const del of deletedLines) {
      // Position deleted line markers at the afterLine position (or line 1 if at start)
      const markerLine = del.afterLine > 0 ? del.afterLine : 1;
      result.push({ line: markerLine, type: 'deleted' });
    }

    return result;
  }, [changedLines, deletedLines]);

  if (markers.length === 0 || totalLines === 0 || containerHeight === 0) return null;

  return (
    <div
      className="scrollbar-markers-sticky"
      style={{
        position: 'sticky',
        top: 0,
        float: 'right',
        width: 0,
        height: 0,
        overflow: 'visible',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <div
        className="scrollbar-markers"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '8px',
          height: `${containerHeight}px`,
          pointerEvents: 'none',
        }}
      >
        {markers.map((marker, idx) => {
          const topPx = ((marker.line - 1) / totalLines) * containerHeight;
          let color: string;
          if (marker.type === 'added') {
            color = 'rgba(34, 197, 94, 0.75)';
          } else if (marker.type === 'modified') {
            color = 'rgba(250, 204, 21, 0.75)';
          } else {
            color = 'rgba(239, 68, 68, 0.75)';
          }

          return (
            <div
              key={`${marker.type}-${marker.line}-${idx}`}
              data-marker-line={marker.line}
              onClick={handleClick}
              style={{
                position: 'absolute',
                top: `${topPx}px`,
                right: 0,
                width: '8px',
                height: '3px',
                backgroundColor: color,
                borderRadius: '1px',
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
              title={`Line ${marker.line} (${marker.type})`}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Component that renders highlighted HTML and applies line-level highlights.
 * Also inserts deleted lines at their appropriate positions.
 */
function HighlightedCode({
  html,
  lineHighlights,
  deletedLines,
}: {
  html: string;
  lineHighlights: Map<number, LineHighlight>;
  deletedLines: DeletedLine[];
}) {
  const processedHtml = useMemo(() => {
    // Shiki outputs <pre><code>...</code></pre> with .line spans
    // We need to add data attributes to each .line span based on line number
    // and insert deleted lines at their positions
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const lines = doc.querySelectorAll('.line');

    // Apply highlights to existing lines
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

    // Insert deleted lines at their positions (process in reverse to maintain positions)
    if (deletedLines.length > 0) {
      const code = doc.querySelector('code');
      if (code) {
        // Group deleted lines by their afterLine position
        const deletionsByPosition = new Map<number, DeletedLine[]>();
        for (const del of deletedLines) {
          const existing = deletionsByPosition.get(del.afterLine) || [];
          existing.push(del);
          deletionsByPosition.set(del.afterLine, existing);
        }

        // Sort positions in descending order to insert from bottom up
        const positions = Array.from(deletionsByPosition.keys()).sort((a, b) => b - a);

        for (const afterLine of positions) {
          const deletions = deletionsByPosition.get(afterLine) || [];
          const linesArray = Array.from(code.querySelectorAll('.line'));

          // Find the insertion point (after the line at index afterLine-1, or at start if 0)
          const insertBeforeElement = afterLine < linesArray.length ? linesArray[afterLine] : null;

          // Insert deleted lines (in reverse to maintain order)
          for (let i = deletions.length - 1; i >= 0; i--) {
            const del = deletions[i];
            const deletedSpan = doc.createElement('span');
            deletedSpan.className = 'deleted-line';
            deletedSpan.textContent = del.content;

            if (insertBeforeElement) {
              code.insertBefore(deletedSpan, insertBeforeElement);
            } else {
              code.appendChild(deletedSpan);
            }
          }
        }
      }
    }

    // Get the modified HTML from the pre element
    const pre = doc.querySelector('pre');
    return pre ? pre.outerHTML : html;
  }, [html, lineHighlights, deletedLines]);

  return <div dangerouslySetInnerHTML={{ __html: processedHtml }} />;
}
