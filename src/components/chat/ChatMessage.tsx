import { memo, useState, useMemo } from 'react';
import { Copy, Check, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { createCssVariablesTheme } from 'shiki';
import type { ChatMessage as ChatMessageType } from '../../hooks/useAIChat';

interface ChatMessageProps {
  message: ChatMessageType;
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

export const ChatMessageComponent = memo(function ChatMessageComponent({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const isUser = message.role === 'user';

  // Count tool uses
  const toolUseCount = useMemo(() => {
    if (!message.toolUse) return 0;
    return message.toolUse.filter(t => t.type === 'start').length;
  }, [message.toolUse]);

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
        {/* Tool use indicator */}
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

        {/* Message content */}
        <div className="prose prose-sm max-w-none chat-message-prose">
          {message.isStreaming ? (
            <Streamdown
              isAnimating={true}
              caret="block"
              parseIncompleteMarkdown={true}
              plugins={{ code: codePlugin }}
            >
              {message.content || ' '}
            </Streamdown>
          ) : (
            <Streamdown
              isAnimating={false}
              parseIncompleteMarkdown={false}
              plugins={{ code: codePlugin }}
            >
              {message.content}
            </Streamdown>
          )}
        </div>

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

            {message.costUSD != null && (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                ${message.costUSD.toFixed(4)}
              </span>
            )}

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
