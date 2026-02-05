import { useMemo } from 'react';
import { MarkdownViewer } from '../MarkdownViewer';
import { jsonlToMarkdown } from '../../utils/conversationMarkdown';

interface ConversationMarkdownViewerProps {
  content: string;
  filePath?: string;
  fontSize?: number;
  themeClassName?: string;
  isStreaming?: boolean;
}

/**
 * Extract metadata from conversation JSONL content.
 * Looks for the first few entries to get session info.
 */
function extractMetadata(content: string): { messageCount: number; hasThinking: boolean; hasTool: boolean } | null {
  if (!content || !content.trim()) {
    return null;
  }

  const lines = content.split('\n').filter(line => line.trim());
  let messageCount = 0;
  let hasThinking = false;
  let hasTool = false;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.trim());
      if (parsed.type === 'user' || parsed.type === 'assistant') {
        messageCount++;

        // Check for thinking/tool blocks in assistant messages
        if (parsed.type === 'assistant' && Array.isArray(parsed.message?.content)) {
          for (const block of parsed.message.content) {
            if (block.type === 'thinking') hasThinking = true;
            if (block.type === 'tool_use') hasTool = true;
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return messageCount > 0 ? { messageCount, hasThinking, hasTool } : null;
}

/**
 * ConversationMarkdownViewer - Renders Claude Code conversation JSONL as themed markdown.
 *
 * Transforms JSONL conversation logs from ~/.claude/projects/ into readable
 * markdown with User/Assistant headers, thinking blocks, and tool calls.
 */
export function ConversationMarkdownViewer({
  content,
  filePath,
  fontSize = 100,
  themeClassName,
  isStreaming = false,
}: ConversationMarkdownViewerProps) {
  // Transform JSONL to markdown
  const markdown = useMemo(() => jsonlToMarkdown(content), [content]);

  // Extract metadata for header
  const metadata = useMemo(() => extractMetadata(content), [content]);

  // Handle empty content
  if (!markdown) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>No conversation content to display</p>
      </div>
    );
  }

  return (
    <div className="conversation-viewer h-full overflow-auto">
      {/* Metadata header */}
      {metadata && (
        <div
          className="px-8 py-3 border-b flex items-center gap-4 text-sm"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <span>{metadata.messageCount} messages</span>
          {metadata.hasThinking && (
            <span
              className="px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--accent)', color: 'white', opacity: 0.8 }}
            >
              thinking
            </span>
          )}
          {metadata.hasTool && (
            <span
              className="px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--accent)', color: 'white', opacity: 0.8 }}
            >
              tools
            </span>
          )}
          {filePath && (
            <span className="ml-auto truncate max-w-md" title={filePath}>
              {filePath.split('/').slice(-2).join('/')}
            </span>
          )}
        </div>
      )}

      {/* Rendered markdown content */}
      <MarkdownViewer
        content={markdown}
        isStreaming={isStreaming}
        themeClassName={themeClassName}
        fontSize={fontSize}
      />
    </div>
  );
}
