import { memo, useState, useMemo, useEffect } from 'react';
import { Copy, Check, Wrench, BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { createCssVariablesTheme } from 'shiki';
import { createMermaidPlugin } from '@streamdown/mermaid';
import { math } from '@streamdown/math';
import 'katex/dist/katex.min.css';
import type { ChatMessage as ChatMessageType, ModelUsage, ContentSegment } from '../../hooks/useAIChat';

interface ChatMessageProps {
  message: ChatMessageType;
  /** Set of tool segment IDs that should be initially expanded */
  recentToolIds?: Set<string>;
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

// Shared Shiki CSS variables theme
const cssVarsTheme = createCssVariablesTheme({
  name: 'css-variables',
  variablePrefix: '--shiki-',
  variableDefaults: {},
  fontStyle: true,
});

const codePlugin = createCodePlugin({
  // @ts-expect-error - cssVarsTheme is ThemeRegistration, plugin expects BundledTheme
  themes: [cssVarsTheme, cssVarsTheme],
});

/** Inline collapsible tool card */
function ToolCard({ segment, isRunning, initialExpanded = false }: { segment: ContentSegment & { type: 'tool' }; isRunning?: boolean; initialExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [userToggled, setUserToggled] = useState(false);
  const hasInput = segment.input.length > 0;

  // Sync with initialExpanded when it changes, unless user manually toggled
  useEffect(() => {
    if (!userToggled) {
      setExpanded(initialExpanded);
    }
  }, [initialExpanded, userToggled]);

  let formattedInput = segment.input;
  if (hasInput) {
    try {
      formattedInput = JSON.stringify(JSON.parse(segment.input), null, 2);
    } catch {
      // partial or invalid JSON — show raw
    }
  }

  return (
    <div
      className="text-xs"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}
    >
      <button
        onClick={() => { if (hasInput) { setUserToggled(true); setExpanded(!expanded); } }}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left"
        style={{ color: 'var(--text-secondary)', cursor: hasInput ? 'pointer' : 'default' }}
      >
        <Wrench className="w-3 h-3 shrink-0" />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{segment.name}</span>
        {isRunning && (
          <span className="ml-auto animate-pulse" style={{ color: 'var(--accent)' }}>Running...</span>
        )}
        {hasInput && !isRunning && (
          expanded
            ? <ChevronDown className="w-3 h-3 ml-auto shrink-0" />
            : <ChevronRight className="w-3 h-3 ml-auto shrink-0" />
        )}
      </button>
      {expanded && hasInput && (
        <pre
          className="px-3 py-2 overflow-x-auto font-mono"
          style={{
            borderTop: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            maxHeight: '300px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {formattedInput}
        </pre>
      )}
    </div>
  );
}

export const ChatMessageComponent = memo(function ChatMessageComponent({ message, recentToolIds }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [mermaidKey, setMermaidKey] = useState(0);

  const isUser = message.role === 'user';

  // Count tool uses (for fallback rendering of old messages)
  const toolUseCount = useMemo(() => {
    if (!message.toolUse) return 0;
    return message.toolUse.filter(t => t.type === 'start').length;
  }, [message.toolUse]);

  // Use segments for inline rendering when available
  const hasSegments = !!(message.segments && message.segments.length > 0);

  // Get current theme class from body
  const themeClassName = useMemo(() => {
    const bodyClasses = document.body.className.split(' ');
    return bodyClasses.find(c => c.startsWith('theme-')) || '';
  }, []);

  // Create mermaid plugin with theme-aware colors.
  // Uses 'base' theme with darkMode for maximum control — dark/default hardcode
  // internal defaults that override themeVariables for class/state diagrams.
  const mermaidPlugin = useMemo(() => {
    const themeEl = themeClassName ? document.querySelector(`.${themeClassName}`) : document.body;
    const element = themeEl || document.body;
    const bgPrimary = cssColorToHex(getCssVar(element, '--bg-primary') || '#1a1a1a');
    const bgSecondary = cssColorToHex(getCssVar(element, '--bg-secondary') || '#2a2a2a', bgPrimary);
    const textPrimary = cssColorToHex(getCssVar(element, '--text-primary') || '#e0e0e0', bgPrimary);
    const textSecondary = cssColorToHex(getCssVar(element, '--text-secondary') || '#a0a0a0', bgPrimary);
    const accent = cssColorToHex(getCssVar(element, '--accent') || '#3b82f6', bgPrimary);
    const border = cssColorToHex(getCssVar(element, '--border') || '#404040', bgPrimary);
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

  // Force mermaid re-render when theme changes (observe body class changes)
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          setMermaidKey(k => k + 1);
        }
      }
    });
    observer.observe(document.body, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 px-4">
        <div
          className="max-w-[85%] px-4 py-2.5 text-sm whitespace-pre-wrap"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-primary)',
            borderRadius: 'var(--radius)',
            borderBottomRightRadius: '4px',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 px-4 group">
      <div className="max-w-full">
        {/* Thinking indicator */}
        {message.thinking && (
          <button
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className="flex items-center gap-1.5 mb-2 text-xs transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <BrainCircuit className="w-3 h-3" />
            <span>Thinking</span>
            {thinkingExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        )}

        {thinkingExpanded && message.thinking && (
          <div
            className="mb-2 px-3 py-2 text-xs whitespace-pre-wrap"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-secondary)',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            {message.thinking}
          </div>
        )}

        {/* Streaming thinking indicator (thinking is happening but no text content yet) */}
        {message.isStreaming && message.thinking && !message.content && (
          <div
            className="flex items-center gap-1.5 mb-2 text-xs animate-pulse"
            style={{ color: 'var(--text-secondary)' }}
          >
            <BrainCircuit className="w-3 h-3" />
            <span>Thinking...</span>
          </div>
        )}

        {/* Inline segments rendering (new: text + tools interleaved) */}
        {hasSegments ? (
          <div className="space-y-2">
            {message.segments!.map((seg, i) => {
              if (seg.type === 'text') {
                const isLastSegment = i === message.segments!.length - 1;
                const isStreamingText = message.isStreaming && isLastSegment;
                return (
                  <div key={i} className="prose prose-sm max-w-none chat-message-prose">
                    {isStreamingText ? (
                      <Streamdown
                        key={mermaidKey}
                        isAnimating={true}
                        caret="block"
                        parseIncompleteMarkdown={true}
                        plugins={{ code: codePlugin, mermaid: mermaidPlugin, math }}
                        controls={{ mermaid: { fullscreen: false } }}
                      >
                        {seg.text || ' '}
                      </Streamdown>
                    ) : (
                      <Streamdown
                        key={mermaidKey}
                        isAnimating={false}
                        parseIncompleteMarkdown={false}
                        plugins={{ code: codePlugin, mermaid: mermaidPlugin, math }}
                        controls={{ mermaid: { fullscreen: false } }}
                      >
                        {seg.text}
                      </Streamdown>
                    )}
                  </div>
                );
              }
              if (seg.type === 'tool') {
                const isLastSegment = i === message.segments!.length - 1;
                const isRunning = message.isStreaming && isLastSegment;
                const shouldExpand = isRunning || (recentToolIds ? recentToolIds.has(seg.id) : false);
                return <ToolCard key={i} segment={seg} isRunning={isRunning} initialExpanded={shouldExpand} />;
              }
              return null;
            })}
          </div>
        ) : (
          <>
            {/* Fallback: old tool use indicator (for messages without segments) */}
            {toolUseCount > 0 && (
              <button
                onClick={() => setToolsExpanded(!toolsExpanded)}
                className="flex items-center gap-1.5 mb-2 text-xs transition-colors hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Wrench className="w-3 h-3" />
                <span>{toolUseCount} tool{toolUseCount > 1 ? 's' : ''} used</span>
                {toolsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            )}

            {toolsExpanded && message.toolUse && (
              <div
                className="mb-2 px-3 py-2 text-xs font-mono space-y-0.5"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-secondary)',
                }}
              >
                {message.toolUse
                  .filter(t => t.type === 'start' && t.name)
                  .map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Wrench className="w-3 h-3" />
                      <span>{t.name}</span>
                    </div>
                  ))}
              </div>
            )}

            {/* Fallback: Message content */}
            <div className="prose prose-sm max-w-none chat-message-prose">
              {message.isStreaming ? (
                <Streamdown
                  key={mermaidKey}
                  isAnimating={true}
                  caret="block"
                  parseIncompleteMarkdown={true}
                  plugins={{ code: codePlugin, mermaid: mermaidPlugin, math }}
                  controls={{ mermaid: { fullscreen: false } }}
                >
                  {message.content || ' '}
                </Streamdown>
              ) : (
                <Streamdown
                  key={mermaidKey}
                  isAnimating={false}
                  parseIncompleteMarkdown={false}
                  plugins={{ code: codePlugin, mermaid: mermaidPlugin, math }}
                  controls={{ mermaid: { fullscreen: false } }}
                >
                  {message.content}
                </Streamdown>
              )}
            </div>
          </>
        )}

        {/* Actions row - visible on hover */}
        {!message.isStreaming && message.content && (
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs transition-colors hover:opacity-80 px-1.5 py-0.5"
              style={{ color: 'var(--text-secondary)', borderRadius: 'var(--radius)' }}
            >
              {copied ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>

            {message.modelUsage && (() => {
              const mu = message.modelUsage as ModelUsage;
              const total = (mu.inputTokens || 0)
                + (mu.outputTokens || 0)
                + (mu.cacheReadInputTokens || 0)
                + (mu.cacheCreationInputTokens || 0);
              return total > 0 ? (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total} tokens
                </span>
              ) : null;
            })()}

            {message.durationMs != null && (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {(message.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
