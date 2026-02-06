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

// Convert css color (hex, rgb, rgba) to a solid hex string.
// Mermaid applies themeVariables as SVG fill attributes, which don't support rgba.
function cssColorToHex(color: string, bgHex?: string): string {
  if (color.startsWith('#') && color.length >= 7) return color;
  const match = color.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
  if (!match) return color;
  let r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);
  const a = match[4] !== undefined ? Number(match[4]) : 1;
  if (a < 1 && bgHex) {
    const bgMatch = bgHex.match(/^#([0-9a-f]{6})$/i);
    if (bgMatch) {
      const bgR = parseInt(bgMatch[1].slice(0, 2), 16);
      const bgG = parseInt(bgMatch[1].slice(2, 4), 16);
      const bgB = parseInt(bgMatch[1].slice(4, 6), 16);
      r = Math.round(r * a + bgR * (1 - a));
      g = Math.round(g * a + bgG * (1 - a));
      b = Math.round(b * a + bgB * (1 - a));
    }
  }
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
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
    const blockSelectors = 'p, h1, h2, h3, h4, h5, h6, pre, ul, ol, blockquote, table, hr, div[data-streamdown="mermaid-block"]';
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

  // Create mermaid plugin with theme-aware colors.
  // Uses 'base' theme with darkMode for maximum control — dark/default hardcode
  // internal defaults that override themeVariables for class/state diagrams.
  const mermaidPlugin = useMemo(() => {
    const themeEl = (themeClassName ? document.querySelector(`.${themeClassName}`) : null) || document.body;
    const bgPrimary = cssColorToHex(getCssVar(themeEl, '--bg-primary') || '#1a1a1a');
    const bgSecondary = cssColorToHex(getCssVar(themeEl, '--bg-secondary') || '#2a2a2a', bgPrimary);
    const textPrimary = cssColorToHex(getCssVar(themeEl, '--text-primary') || '#e0e0e0', bgPrimary);
    const textSecondary = cssColorToHex(getCssVar(themeEl, '--text-secondary') || '#a0a0a0', bgPrimary);
    const accent = cssColorToHex(getCssVar(themeEl, '--accent') || '#3b82f6', bgPrimary);
    const border = cssColorToHex(getCssVar(themeEl, '--border') || '#404040', bgPrimary);
    const isDark = isDarkColor(bgPrimary);

    // Generate contrasting text color for colored pie/journey slices.
    // On dark themes, light text; on light themes, dark text.
    const contrastText = isDark ? '#ffffff' : '#000000';

    // Inject CSS directly into mermaid's SVG <style> tag via themeCSS.
    // Mermaid scopes all styles with #svgId (mermaid.esm.mjs:1318), so themeCSS
    // gets the same ID-level specificity. !important ensures these beat the
    // base theme styles AND rough.js fill attributes on the SVG elements.
    const themeCSS = `
      /* Class/State/Flowchart node fills */
      .node rect, .node path, .node circle, .node polygon, .node ellipse { fill: ${bgSecondary} !important; stroke: ${accent} !important; }
      .basic.label-container { fill: ${bgSecondary} !important; stroke: ${accent} !important; }
      g.classGroup rect { fill: ${bgSecondary} !important; stroke: ${accent} !important; }
      g.classGroup text { fill: ${textPrimary} !important; }
      .classLabel .box { fill: ${bgSecondary} !important; }
      .classLabel .label { fill: ${textPrimary} !important; }
      .nodeLabel { color: ${textPrimary} !important; }
      .edgeLabel { color: ${textPrimary} !important; }
      .edgeLabel .label rect { fill: ${bgSecondary} !important; }
      .edgeLabel .label span { background: ${bgSecondary} !important; }
      .edgeLabel .label text { fill: ${textPrimary} !important; }
      .edgeLabel .label { fill: ${textPrimary} !important; }
      .cluster-label { color: ${textPrimary} !important; }
      .statediagram-state rect.basic { fill: ${bgSecondary} !important; stroke: ${accent} !important; }
      .statediagram-cluster rect { fill: ${bgPrimary} !important; stroke: ${accent} !important; }
      .divider line, .divider path { stroke: ${border} !important; }

      /* State diagram — transition labels, group text, notes, title */
      g.stateGroup text { fill: ${textPrimary} !important; }
      g.stateGroup .state-title { fill: ${textPrimary} !important; }
      .stateLabel text { fill: ${textPrimary} !important; }
      .statediagramTitleText { fill: ${textPrimary} !important; }
      .state-note text { fill: ${textPrimary} !important; }
      .state-note { fill: ${bgSecondary} !important; stroke: ${accent} !important; }
      .stateGroup .composit { fill: ${bgPrimary} !important; }
      .stateGroup .alt-composit { fill: ${bgSecondary} !important; }
      .transition { stroke: ${textSecondary} !important; }

      /* Sequence diagram — message text, labels, loops, notes */
      .messageText { fill: ${textPrimary} !important; }
      .labelText, .labelText > tspan { fill: ${textPrimary} !important; }
      .loopText, .loopText > tspan { fill: ${textPrimary} !important; }
      .loopLine { stroke: ${border} !important; }
      .noteText, .noteText > tspan { fill: ${textPrimary} !important; }
      .note { fill: ${bgSecondary} !important; stroke: ${accent} !important; }
      .sequenceNumber { fill: ${textPrimary} !important; }
      .messageLine0, .messageLine1 { stroke: ${textSecondary} !important; }
      .labelBox { fill: ${bgSecondary} !important; stroke: ${border} !important; }

      /* Gantt chart — section titles, axis tick text, task text, title */
      .titleText { fill: ${textPrimary} !important; }
      .sectionTitle { fill: ${textPrimary} !important; }
      .sectionTitle0, .sectionTitle1, .sectionTitle2, .sectionTitle3 { fill: ${textPrimary} !important; }
      .grid .tick text { fill: ${textPrimary} !important; }
      .taskText { fill: ${textPrimary} !important; }
      .taskTextOutsideRight, .taskTextOutsideLeft { fill: ${textPrimary} !important; }
      .taskTextOutside0, .taskTextOutside1, .taskTextOutside2, .taskTextOutside3 { fill: ${textPrimary} !important; }

      /* Pie chart — title, legend, slice labels */
      .pieTitleText { fill: ${textPrimary} !important; }
      .legend text { fill: ${textPrimary} !important; }
      .pieCircle { stroke: ${bgPrimary} !important; }

      /* ER diagram — entity text, relationship labels */
      .entityBox { fill: ${bgSecondary} !important; stroke: ${accent} !important; }
      .entityLabel { fill: ${textPrimary} !important; }
      .relationshipLabel { fill: ${textPrimary} !important; }
      .relationshipLabelBox { fill: ${bgSecondary} !important; background-color: ${bgSecondary} !important; }
      .relationshipLine { stroke: ${textSecondary} !important; }
      .attributeBoxOdd { fill: ${bgSecondary} !important; }
      .attributeBoxEven { fill: ${bgPrimary} !important; }

      /* Git graph — commit labels, branch labels, tag labels, title */
      .commit-id, .commit-msg, .branch-label { fill: ${textPrimary} !important; color: ${textPrimary} !important; }
      .commit-label { fill: ${textPrimary} !important; }
      .tag-label { fill: ${textPrimary} !important; }
      .gitTitleText { fill: ${textPrimary} !important; }

      /* Journey diagram — override hardcoded .label text { fill: #333 } and
         .face { fill: #FFF8DC }, .mouth/.task-line { stroke: #666 } */
      .label text { fill: ${textPrimary} !important; }
      .label { color: ${textPrimary} !important; }
      .face { fill: ${bgSecondary} !important; stroke: ${textSecondary} !important; }
      .mouth { stroke: ${textSecondary} !important; }
      .task-line { stroke: ${textSecondary} !important; }
      .legend { fill: ${textPrimary} !important; }
    `;

    return createMermaidPlugin({
      config: {
        theme: 'base',
        themeCSS,
        // Gantt diagram sizing — explicit values prevent near-zero-height
        // rendering that occurs when the SVG collapses inside flex containers.
        gantt: {
          barHeight: 24,
          barGap: 6,
          topPadding: 50,
          sectionFontSize: 14,
          fontSize: 12,
          useMaxWidth: true,
        },
        themeVariables: {
          darkMode: isDark,

          // Base colors — explicit to prevent mermaid's hue-rotation derivation
          background: bgPrimary,
          primaryColor: bgSecondary,
          secondaryColor: bgSecondary,
          tertiaryColor: bgPrimary,

          // Text — set textColor explicitly so diagram types that reference it
          // (journey, pie, gantt, kanban, git) get the correct value rather
          // than relying on Mermaid's invert(background) derivation.
          textColor: textPrimary,
          primaryTextColor: textPrimary,
          secondaryTextColor: textSecondary,
          tertiaryTextColor: textSecondary,
          nodeTextColor: textPrimary,
          titleColor: textPrimary,

          // Borders & lines
          // Note: nodeBorder intentionally omitted — mermaid v11 uses
          // (nodeBorder || classText) for class diagram text, so setting
          // nodeBorder to accent would override classText with accent color.
          primaryBorderColor: accent,
          secondaryBorderColor: border,
          tertiaryBorderColor: border,
          lineColor: textSecondary,

          // Flowchart — mainBkg drives node fills for class diagrams too
          mainBkg: bgSecondary,
          edgeLabelBackground: bgSecondary,
          clusterBkg: bgPrimary,
          clusterBorder: accent,

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
          activationBkgColor: bgSecondary,
          activationBorderColor: accent,
          sequenceNumberColor: textPrimary,

          // State diagram — stateBkg falls back to mainBkg,
          // stateLabelColor is the actual text var (stateTextColor doesn't exist in v11).
          // IMPORTANT: stateLabelColor must be set because Mermaid's base theme
          // derives it as (stateLabelColor || stateBkg || primaryTextColor) —
          // if unset, it would pick up stateBkg (a background color) as text.
          stateBkg: bgSecondary,
          stateLabelColor: textPrimary,
          labelColor: textPrimary,
          altBackground: bgSecondary,
          transitionColor: textSecondary,
          transitionLabelColor: textPrimary,
          specialStateColor: accent,
          compositeBackground: bgPrimary,
          compositeTitleBackground: bgSecondary,
          compositeBorder: border,
          labelBackgroundColor: bgSecondary,
          innerEndBackground: border,
          errorBkgColor: bgSecondary,
          errorTextColor: textPrimary,

          // Class diagram — classText is the text color,
          // node fill comes from mainBkg (set above)
          classText: textPrimary,

          // Pie chart — without these, pie colors derive from primaryColor via
          // hue-rotation which produces invisible dark slices on dark themes.
          // pieTitleTextColor/pieLegendTextColor fall back to taskTextDarkColor
          // which can be wrong, so set them all explicitly.
          pie1: accent,
          pie2: textSecondary,
          pie3: border,
          pie4: bgSecondary,
          pieTitleTextColor: textPrimary,
          pieSectionTextColor: contrastText,
          pieLegendTextColor: textPrimary,
          pieStrokeColor: bgPrimary,
          pieOuterStrokeColor: bgPrimary,

          // Gantt — task text colors fall back to textColor which we now set,
          // but set explicitly for safety
          taskTextColor: textPrimary,
          taskTextOutsideColor: textPrimary,
          taskTextLightColor: textPrimary,
          taskTextDarkColor: textPrimary,
          taskTextClickableColor: accent,
          taskBkgColor: bgSecondary,
          taskBorderColor: accent,
          activeTaskBkgColor: bgSecondary,
          activeTaskBorderColor: accent,
          doneTaskBkgColor: bgPrimary,
          doneTaskBorderColor: border,
          sectionBkgColor: bgSecondary,
          sectionBkgColor2: bgPrimary,
          altSectionBkgColor: bgPrimary,
          gridColor: border,
          todayLineColor: accent,

          // ER diagram — attributeBackgroundColor defaults to hardcoded white
          attributeBackgroundColorOdd: bgSecondary,
          attributeBackgroundColorEven: bgPrimary,
          relationLabelBackground: bgSecondary,
          relationLabelColor: textPrimary,

          // Requirement diagram
          requirementBackground: bgSecondary,
          requirementBorderColor: accent,
          requirementTextColor: textPrimary,
          relationColor: textSecondary,

          // Notes
          noteBkgColor: bgSecondary,
          noteTextColor: textPrimary,
          noteBorderColor: accent,

          // Git graph — override lightgrey defaults for commit/branch/tag labels
          commitLabelColor: textPrimary,
          commitLabelBackground: bgSecondary,
          tagLabelColor: textPrimary,
          tagLabelBackground: bgSecondary,
          tagLabelBorder: accent,

          // Journey/Gantt fillTypes — used for .section-type-N and .task-type-N CSS.
          // Without these, base theme derives via hue-rotation from primaryColor
          // which can produce invisible/clashing colors on custom palettes.
          fillType0: bgSecondary,
          fillType1: accent,
          fillType2: border,
          fillType3: bgPrimary,
          fillType4: bgSecondary,
          fillType5: accent,
          fillType6: border,
          fillType7: bgPrimary,

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
