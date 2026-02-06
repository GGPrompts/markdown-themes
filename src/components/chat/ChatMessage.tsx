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

  // Create mermaid plugin with theme-aware colors
  const mermaidPlugin = useMemo(() => {
    // Find theme element to read CSS variables
    const themeEl = themeClassName ? document.querySelector(`.${themeClassName}`) : document.body;
    const element = themeEl || document.body;

    const bgPrimary = getCssVar(element, '--bg-primary') || '#1a1a1a';
    const bgSecondary = getCssVar(element, '--bg-secondary') || '#2a2a2a';
    const textPrimary = getCssVar(element, '--text-primary') || '#e0e0e0';
    const textSecondary = getCssVar(element, '--text-secondary') || '#a0a0a0';
    const accent = getCssVar(element, '--accent') || '#3b82f6';
    const border = getCssVar(element, '--border') || '#404040';

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

          // Text colors - explicit for all diagram types
          primaryTextColor: textPrimary,
          secondaryTextColor: textSecondary,
          tertiaryTextColor: textSecondary,
          nodeTextColor: textPrimary,

          // Border/line colors
          primaryBorderColor: border,
          secondaryBorderColor: border,
          tertiaryBorderColor: border,
          lineColor: textSecondary,

          // Accent colors for nodes
          nodeBorder: accent,
          clusterBorder: accent,
          clusterBkg: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',

          // Note styling
          noteBkgColor: isDark ? '#3a3a3a' : '#fffde7',
          noteTextColor: textPrimary,
          noteBorderColor: accent,

          // Flowchart specific
          mainBkg: bgSecondary,
          nodeBkg: bgSecondary,
          edgeLabelBackground: bgSecondary,
          titleColor: textPrimary,

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
          pieTitleTextColor: textPrimary,
          pieSectionTextColor: textPrimary,
          pieLegendTextColor: textPrimary,

          // State diagram
          labelColor: textPrimary,
          altBackground: isDark ? '#2a2a2a' : '#f5f5f5',
          transitionColor: textSecondary,
          stateBkg: bgSecondary,
          stateTextColor: textPrimary,
          stateLabelColor: textPrimary,

          // Class diagram
          classText: textPrimary,

          // Gantt chart
          sectionBkgColor: bgSecondary,
          taskTextColor: textPrimary,
          taskTextOutsideColor: textPrimary,
          gridColor: border,
          doneTaskBkgColor: isDark ? '#3a3a3a' : '#e0e0e0',

          // Git graph
          git0: accent,
          gitBranchLabel0: textPrimary,

          // Requirement diagram
          requirementBackground: bgSecondary,
          requirementTextColor: textPrimary,

          // Font
          fontFamily: 'inherit',
          fontSize: '14px',
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
