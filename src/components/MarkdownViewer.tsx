import { forwardRef, useImperativeHandle, useRef, useMemo, useEffect, useState } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { createCssVariablesTheme } from 'shiki';
import { createMermaidPlugin } from '@streamdown/mermaid';
import { math } from '@streamdown/math';
import 'katex/dist/katex.min.css';
import { useGitDiff } from '../hooks/useGitDiff';
import { mapLinesToBlocks } from '../utils/markdownDiff';

interface MarkdownViewerProps {
  content: string;
  isStreaming?: boolean;
  themeClassName?: string;
  fontSize?: number;
  /** File path for git diff highlighting */
  filePath?: string | null;
  /** Repository root path for git diff highlighting */
  repoPath?: string | null;
}

// Helper to get CSS variable value from computed style
function getCssVar(element: Element, varName: string): string {
  return getComputedStyle(element).getPropertyValue(varName).trim();
}

// Helper to determine if a color is dark
function isDarkColor(color: string): boolean {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }
  // Handle rgb/rgba
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const [, r, g, b] = match.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }
  return true; // Default to dark
}

export interface MarkdownViewerHandle {
  getHtml: () => string;
}

// Create a single CSS variables theme - colors defined in each theme's CSS
const cssVarsTheme = createCssVariablesTheme({
  name: 'css-variables',
  variablePrefix: '--shiki-',
  variableDefaults: {},
  fontStyle: true,
});

export const MarkdownViewer = forwardRef<MarkdownViewerHandle, MarkdownViewerProps>(function MarkdownViewer({ content, isStreaming = false, themeClassName, fontSize = 100, filePath = null, repoPath = null }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mermaidKey, setMermaidKey] = useState(0);

  // Git diff highlighting - disabled during streaming to avoid render thrashing
  const { changedLines: gitChangedLines } = useGitDiff({
    filePath,
    repoPath,
    content, // Trigger refetch on content change
    debounceMs: 1000, // Longer debounce to avoid rapid refetches
    enabled: !isStreaming && !!filePath && !!repoPath, // Disable during streaming
  });

  // Map git diff line numbers to markdown blocks
  const blocksWithChanges = useMemo(() => {
    if (gitChangedLines.size === 0 || !content) {
      return null;
    }
    // Convert GitDiffLineType to the format mapLinesToBlocks expects
    const lineChanges = new Map<number, 'added' | 'modified'>();
    for (const [line, type] of gitChangedLines) {
      if (type === 'added' || type === 'modified') {
        lineChanges.set(line, type);
      }
    }
    if (lineChanges.size === 0) {
      return null;
    }
    return mapLinesToBlocks(content, lineChanges);
  }, [content, gitChangedLines]);

  // Check if we have any changes to highlight
  const hasChanges = blocksWithChanges?.some(b => b.changeType) ?? false;

  // Apply diff highlighting to rendered content after Streamdown renders
  useEffect(() => {
    if (!containerRef.current || !hasChanges || !blocksWithChanges) return;

    const streamdownContent = containerRef.current.querySelector('.streamdown-content');
    if (!streamdownContent) return;

    // Get all top-level block elements (p, h1-h6, pre, ul, ol, blockquote, table, hr)
    const blockSelectors = 'p, h1, h2, h3, h4, h5, h6, pre, ul, ol, blockquote, table, hr, div.mermaid';
    const blockElements = streamdownContent.querySelectorAll(`:scope > ${blockSelectors}`);

    // Remove any existing diff highlights
    blockElements.forEach(el => {
      el.removeAttribute('data-diff');
    });

    // Apply new highlights based on blocksWithChanges
    // Note: blocksWithChanges may not map 1:1 to rendered elements due to markdown parsing
    // We use a heuristic: apply highlights to elements at similar positions
    blocksWithChanges.forEach((block, index) => {
      if (block.changeType && blockElements[index]) {
        blockElements[index].setAttribute('data-diff', block.changeType);
      }
    });
  }, [content, hasChanges, blocksWithChanges]);

  // Create code plugin with CSS variables theme (colors controlled by CSS)
  const codePlugin = useMemo(() => {
    return createCodePlugin({
      // @ts-expect-error - cssVarsTheme is ThemeRegistration, plugin expects BundledTheme but accepts custom themes
      themes: [cssVarsTheme, cssVarsTheme], // Same theme for light/dark - CSS controls colors
    });
  }, []);

  // Create mermaid plugin with theme-aware colors
  const mermaidPlugin = useMemo(() => {
    // Find theme element to read CSS variables
    const themeEl = document.querySelector(`.${themeClassName}`) || document.body;

    const bgPrimary = getCssVar(themeEl, '--bg-primary') || '#1a1a1a';
    const bgSecondary = getCssVar(themeEl, '--bg-secondary') || '#2a2a2a';
    const textPrimary = getCssVar(themeEl, '--text-primary') || '#e0e0e0';
    const textSecondary = getCssVar(themeEl, '--text-secondary') || '#a0a0a0';
    const accent = getCssVar(themeEl, '--accent') || '#3b82f6';
    const border = getCssVar(themeEl, '--border') || '#404040';

    const isDark = isDarkColor(bgPrimary);

    return createMermaidPlugin({
      config: {
        theme: 'base',
        themeVariables: {
          // Background colors
          background: bgSecondary,
          primaryColor: bgSecondary,
          secondaryColor: isDark ? '#3a3a3a' : '#f0f0f0',
          tertiaryColor: isDark ? '#2a2a2a' : '#fafafa',

          // Text colors
          primaryTextColor: textPrimary,
          secondaryTextColor: textSecondary,
          tertiaryTextColor: textSecondary,

          // Border/line colors
          primaryBorderColor: border,
          secondaryBorderColor: border,
          tertiaryBorderColor: border,
          lineColor: textSecondary,

          // Accent colors for nodes
          nodeBorder: accent,
          clusterBorder: accent,

          // Note styling
          noteBkgColor: isDark ? '#3a3a3a' : '#fffde7',
          noteTextColor: textPrimary,
          noteBorderColor: accent,

          // Flowchart specific
          mainBkg: bgSecondary,
          nodeBkg: bgSecondary,

          // Sequence diagram
          actorBkg: bgSecondary,
          actorBorder: accent,
          actorTextColor: textPrimary,
          actorLineColor: textSecondary,
          signalColor: textPrimary,
          signalTextColor: textPrimary,
          labelBoxBkgColor: bgSecondary,
          labelBoxBorderColor: border,
          labelTextColor: textPrimary,
          loopTextColor: textPrimary,

          // Pie chart
          pie1: accent,
          pie2: isDark ? '#4ade80' : '#22c55e',
          pie3: isDark ? '#f472b6' : '#ec4899',
          pie4: isDark ? '#facc15' : '#eab308',
          pie5: isDark ? '#60a5fa' : '#3b82f6',
          pie6: isDark ? '#a78bfa' : '#8b5cf6',
          pie7: isDark ? '#fb923c' : '#f97316',
          pieStrokeColor: bgPrimary,
          pieOuterStrokeColor: bgPrimary,

          // State diagram
          labelColor: textPrimary,
          altBackground: isDark ? '#2a2a2a' : '#f5f5f5',

          // Font
          fontFamily: 'inherit',
          fontSize: '14px',
        },
      },
    });
  }, [themeClassName, mermaidKey]);

  // Force mermaid re-render when theme changes
  useEffect(() => {
    setMermaidKey(k => k + 1);
  }, [themeClassName]);

  useImperativeHandle(ref, () => ({
    getHtml: () => {
      if (containerRef.current) {
        const streamdownContent = containerRef.current.querySelector('.streamdown-content');
        return streamdownContent?.innerHTML ?? containerRef.current.innerHTML;
      }
      return '';
    },
  }), []);

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        <p>Open a markdown file to get started</p>
      </div>
    );
  }

  // Use transform: scale() instead of zoom for better font rendering
  // zoom causes subpixel rendering issues with thin fonts like Poiret One
  const scale = fontSize / 100;
  const needsScaling = scale !== 1;

  return (
    <article
      ref={containerRef}
      className="prose prose-lg max-w-none p-8"
      style={needsScaling ? {
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        width: `${100 / scale}%`,
      } : undefined}
    >
      <Streamdown
        key={mermaidKey}
        isAnimating={isStreaming}
        caret={isStreaming ? 'block' : undefined}
        parseIncompleteMarkdown={true}
        className="streamdown-content"
        plugins={{ code: codePlugin, mermaid: mermaidPlugin, math }}
        controls={{ mermaid: { fullscreen: false } }}
      >
        {content}
      </Streamdown>
    </article>
  );
});
