import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { MarkdownViewer } from '../MarkdownViewer';
import { jsonlToMarkdown } from '../../utils/conversationMarkdown';

/** Maximum messages to display (prevents UI freeze on large conversations) */
const MAX_MESSAGES = 100;

/** Maximum lines to scan for metadata (prevents freeze on 10MB+ files) */
const MAX_METADATA_SCAN_LINES = 500;

interface ConversationMetadata {
  messageCount: number;
  estimatedTotal: number | null; // null if exact, number if estimated
  hasThinking: boolean;
  hasTool: boolean;
}

interface ConversationMarkdownViewerProps {
  content: string;
  filePath?: string;
  fontSize?: number;
  themeClassName?: string;
  isStreaming?: boolean;
}

/**
 * Custom hook to throttle content updates during streaming.
 * This prevents expensive re-parsing of large JSONL files on every WebSocket message.
 */
function useThrottledContent(content: string, isStreaming: boolean, throttleMs: number = 1000): string {
  const [throttledContent, setThrottledContent] = useState(content);
  const lastUpdateRef = useRef<number>(0);
  const pendingContentRef = useRef<string>(content);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    pendingContentRef.current = content;

    // If not streaming, update immediately
    if (!isStreaming) {
      setThrottledContent(content);
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // If enough time has passed, update immediately
    if (timeSinceLastUpdate >= throttleMs) {
      lastUpdateRef.current = now;
      setThrottledContent(content);
    } else {
      // Schedule an update for the remaining time
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setThrottledContent(pendingContentRef.current);
      }, throttleMs - timeSinceLastUpdate);
    }

    return () => clearTimeout(timeoutRef.current);
  }, [content, isStreaming, throttleMs]);

  // Final update when streaming stops
  useEffect(() => {
    if (!isStreaming && pendingContentRef.current !== throttledContent) {
      setThrottledContent(pendingContentRef.current);
    }
  }, [isStreaming, throttledContent]);

  return throttledContent;
}

/**
 * Efficiently extract the last N lines from a string without splitting the entire content.
 */
function extractLastLines(content: string, maxLines: number): string {
  if (maxLines <= 0) return content;

  let newlineCount = 0;
  let pos = content.length;

  while (pos > 0 && newlineCount < maxLines) {
    pos = content.lastIndexOf('\n', pos - 1);
    if (pos === -1) break;
    newlineCount++;
  }

  return pos > 0 ? content.slice(pos + 1) : content;
}

/**
 * Extract metadata from conversation JSONL content.
 * For large files, samples lines and estimates total to avoid UI freeze.
 */
function extractMetadata(content: string): ConversationMetadata | null {
  // Early bail-out for empty or very short content
  if (!content || content.length < 10) {
    return null;
  }

  // Check if large file using byte size heuristic (avoid expensive split)
  const isLargeFile = content.length > 100_000; // >100KB

  // For large files, only extract and scan the last N lines
  const contentToScan = isLargeFile
    ? extractLastLines(content, MAX_METADATA_SCAN_LINES)
    : content;

  const lines = contentToScan.split('\n').filter(line => line.trim());
  const linesToScan = lines;

  let messageCount = 0;
  let hasThinking = false;
  let hasTool = false;

  for (const line of linesToScan) {
    try {
      const parsed: unknown = JSON.parse(line.trim());

      // Type guard: ensure parsed is an object with a type property
      if (
        parsed &&
        typeof parsed === 'object' &&
        'type' in parsed &&
        typeof (parsed as { type: unknown }).type === 'string'
      ) {
        const entry = parsed as { type: string; message?: unknown };

        if (entry.type === 'user' || entry.type === 'assistant') {
          messageCount++;

          // Check for thinking/tool blocks in assistant messages
          if (
            entry.type === 'assistant' &&
            entry.message &&
            typeof entry.message === 'object' &&
            'content' in entry.message &&
            Array.isArray((entry.message as { content: unknown }).content)
          ) {
            const content = (entry.message as { content: unknown[] }).content;
            for (const block of content) {
              if (
                block &&
                typeof block === 'object' &&
                'type' in block &&
                typeof (block as { type: unknown }).type === 'string'
              ) {
                const blockType = (block as { type: string }).type;
                if (blockType === 'thinking') hasThinking = true;
                if (blockType === 'tool_use') hasTool = true;
              }
            }
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (messageCount === 0) {
    return null;
  }

  // Estimate total if we only scanned a subset
  let estimatedTotal: number | null = null;
  if (isLargeFile && linesToScan.length > 0) {
    // Estimate total based on average line length in sample
    const avgLineLength = contentToScan.length / linesToScan.length;
    const estimatedTotalLines = Math.round(content.length / avgLineLength);
    const messageDensity = messageCount / linesToScan.length;
    estimatedTotal = Math.round(messageDensity * estimatedTotalLines);
  }

  return { messageCount, estimatedTotal, hasThinking, hasTool };
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
  // Whether to load all messages (bypass MAX_MESSAGES limit)
  const [loadAll, setLoadAll] = useState(false);

  // Reset loadAll when switching files
  const prevFilePathRef = useRef(filePath);
  useEffect(() => {
    if (filePath !== prevFilePathRef.current) {
      prevFilePathRef.current = filePath;
      setLoadAll(false);
    }
  }, [filePath]);

  // Throttle content updates during streaming to prevent expensive re-parsing
  // Only update at most once per second when streaming
  const throttledContent = useThrottledContent(content, isStreaming, 1000);

  // Transform JSONL to markdown (now using throttled content)
  // Wrapped in try-catch to handle malformed JSONL gracefully
  // Uses MAX_MESSAGES to prevent UI freeze on large conversations
  const markdown = useMemo(() => {
    // Early bail-out for empty or very short content
    if (!throttledContent || throttledContent.length < 10) {
      return '';
    }
    try {
      return jsonlToMarkdown(throttledContent, loadAll ? 0 : MAX_MESSAGES);
    } catch (err) {
      console.error('Failed to parse conversation JSONL:', err);
      return '';
    }
  }, [throttledContent, loadAll]);

  // Cache metadata to avoid re-parsing during streaming
  // Only re-extract when content length decreases (new file) or streaming stops
  const metadataCache = useRef<{ content: string; metadata: ConversationMetadata | null } | null>(null);
  const prevContentLengthRef = useRef<number>(0);

  const getMetadata = useCallback((content: string, streaming: boolean): ConversationMetadata | null => {
    const contentLength = content.length;

    // If content length decreased, it's a new file - clear cache
    if (contentLength < prevContentLengthRef.current) {
      metadataCache.current = null;
    }
    prevContentLengthRef.current = contentLength;

    // During streaming, reuse cached metadata if available
    if (streaming && metadataCache.current) {
      return metadataCache.current.metadata;
    }

    // Extract fresh metadata when not streaming or no cache
    const metadata = extractMetadata(content);
    metadataCache.current = { content, metadata };
    return metadata;
  }, []);

  // Extract metadata for header (optimized with caching)
  const metadata = useMemo(
    () => getMetadata(throttledContent, isStreaming),
    [throttledContent, isStreaming, getMetadata]
  );

  // Scroll to bottom on initial load (conversations are chronological)
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    // Only scroll once on initial content load, not during streaming updates
    if (markdown && !hasScrolledRef.current && containerRef.current) {
      hasScrolledRef.current = true;
      // Double rAF ensures layout is complete before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        });
      });
    }
  }, [markdown]);

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
    <div ref={containerRef} className="conversation-viewer h-full overflow-auto">
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
          <span>
            {loadAll
              ? `${metadata.messageCount} messages`
              : metadata.estimatedTotal !== null
                ? `~${metadata.estimatedTotal.toLocaleString()} messages (showing last ${MAX_MESSAGES})`
                : metadata.messageCount > MAX_MESSAGES
                  ? `${metadata.messageCount.toLocaleString()} messages (showing last ${MAX_MESSAGES})`
                  : `${metadata.messageCount} messages`}
          </span>
          {/* Load all messages button - shown when truncated and not streaming */}
          {!loadAll && !isStreaming && (metadata.messageCount > MAX_MESSAGES || metadata.estimatedTotal !== null) && (
            <button
              onClick={() => setLoadAll(true)}
              className="px-2.5 py-0.5 rounded text-xs cursor-pointer transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--accent)',
                border: '1px solid var(--border)',
              }}
            >
              Load all messages
            </button>
          )}
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
