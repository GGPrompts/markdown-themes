/**
 * conversationMarkdown.ts - Transform JSONL conversation content to markdown
 *
 * Converts Claude Code conversation logs (from ~/.claude/projects/)
 * into themed markdown for viewing.
 */

/** Content block types from Claude Code conversations */
interface TextBlock {
  type: 'text';
  text: string;
}

interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | unknown[];
}

type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

/** User message format */
interface UserMessage {
  type: 'user';
  message: {
    content: string | ContentBlock[];
  };
}

/** Assistant message format */
interface AssistantMessage {
  type: 'assistant';
  message: {
    content: string | ContentBlock[];
  };
}

/** Summary message format (conversation metadata) */
interface SummaryMessage {
  type: 'summary';
  summary: string;
}

type ConversationEntry = UserMessage | AssistantMessage | SummaryMessage | { type: string };

/**
 * Check if a user message is actual user input vs internal/meta messages.
 */
function isRealUserMessage(entry: UserMessage & { isMeta?: boolean }): boolean {
  // Skip meta messages (system caveats, etc.)
  if (entry.isMeta) return false;

  const content = entry.message?.content;
  if (!content) return false;

  // Handle string content
  if (typeof content === 'string') {
    const trimmed = content.trim();
    // Skip empty messages
    if (!trimmed) return false;
    // Skip command invocations
    if (trimmed.startsWith('<command-name>') || trimmed.startsWith('<command-message>')) return false;
    // Skip empty local command outputs
    if (trimmed === '<local-command-stdout></local-command-stdout>') return false;
    // Skip local command caveats
    if (trimmed.startsWith('<local-command-caveat>')) return false;
    return true;
  }

  // Handle array content (tool_result blocks are not real user input)
  if (Array.isArray(content)) {
    // If it's only tool_result blocks, skip it
    const hasNonToolResult = content.some(
      (block) => block.type !== 'tool_result'
    );
    return hasNonToolResult;
  }

  return true;
}

/**
 * Efficiently extract the last N lines from a string without splitting the entire content.
 * For large files, this is much faster than split('\n').slice(-N).
 */
function extractLastLines(content: string, maxLines: number): string {
  if (maxLines <= 0) return content;

  let newlineCount = 0;
  let pos = content.length;

  // Find the position of the Nth newline from the end
  while (pos > 0 && newlineCount < maxLines) {
    pos = content.lastIndexOf('\n', pos - 1);
    if (pos === -1) break;
    newlineCount++;
  }

  // If we found enough lines, return from that position
  // Otherwise return the whole content
  return pos > 0 ? content.slice(pos + 1) : content;
}

/**
 * Parse JSONL content into conversation entries.
 * Filters for user/assistant/summary types only.
 *
 * @param content JSONL string
 * @param maxLines Maximum lines to parse (0 for unlimited). When limited,
 *                 takes from the END of the file to show recent messages.
 */
function parseConversationEntries(content: string, maxLines: number = 0): ConversationEntry[] {
  const entries: ConversationEntry[] = [];

  // For large files, extract only the tail to avoid splitting entire content
  const contentToSplit = maxLines > 0 ? extractLastLines(content, maxLines) : content;
  const lines = contentToSplit.split('\n');

  // Truncate lines BEFORE parsing to reduce cost on large files
  // Take from the end to get most recent messages
  if (maxLines > 0 && lines.length > maxLines) {
    lines = lines.slice(-maxLines);
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as ConversationEntry & { isMeta?: boolean };
      if (parsed.type === 'user') {
        // Filter out internal/meta user messages
        if (isRealUserMessage(parsed as UserMessage & { isMeta?: boolean })) {
          entries.push(parsed);
        }
      } else if (parsed.type === 'assistant' || parsed.type === 'summary') {
        entries.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Format a user message to markdown.
 */
function formatUserMessage(entry: UserMessage): string {
  const content = entry.message.content;

  if (typeof content === 'string') {
    return `## User\n\n${content}`;
  }

  // Handle array content (rare for user messages but possible)
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      parts.push(block.text);
    }
  }

  return `## User\n\n${parts.join('\n\n')}`;
}

/**
 * Format an assistant message to markdown.
 * Handles text, thinking, and tool_use blocks.
 * @param entry The assistant message entry
 * @param expandLastThinking If true, expands the last thinking block in this message
 */
function formatAssistantMessage(entry: AssistantMessage, expandLastThinking = false): string {
  const content = entry.message.content;

  if (typeof content === 'string') {
    return `## Assistant\n\n${content}`;
  }

  // Find the index of the last thinking block if we need to expand it
  let lastThinkingIndex = -1;
  if (expandLastThinking) {
    for (let i = content.length - 1; i >= 0; i--) {
      if (content[i].type === 'thinking') {
        lastThinkingIndex = i;
        break;
      }
    }
  }

  const parts: string[] = ['## Assistant'];

  for (let i = 0; i < content.length; i++) {
    const block = content[i];
    switch (block.type) {
      case 'text':
        parts.push(block.text);
        break;

      case 'thinking':
        parts.push(formatThinkingBlock(block.thinking, i === lastThinkingIndex));
        break;

      case 'tool_use':
        parts.push(formatToolUseBlock(block.name, block.input));
        break;

      case 'tool_result':
        parts.push(formatToolResultBlock(block.content));
        break;
    }
  }

  return parts.join('\n\n');
}

/**
 * Format thinking block as collapsible details element.
 * @param thinking The thinking content
 * @param isExpanded Whether to render the details element open (default false)
 */
function formatThinkingBlock(thinking: string, isExpanded = false): string {
  return `<details${isExpanded ? ' open' : ''}>
<summary>Thinking</summary>

${thinking}

</details>`;
}

/**
 * Format tool_use block with tool name and JSON input.
 */
function formatToolUseBlock(name: string, input: unknown): string {
  const inputJson = JSON.stringify(input, null, 2);
  return `### Tool: ${name}\n\n\`\`\`json\n${inputJson}\n\`\`\``;
}

/**
 * Format tool_result block.
 */
function formatToolResultBlock(content: string | unknown[]): string {
  if (typeof content === 'string') {
    // Truncate very long results
    const maxLength = 2000;
    const displayContent = content.length > maxLength
      ? content.slice(0, maxLength) + '\n... (truncated)'
      : content;

    return `<details>
<summary>Tool Result</summary>

\`\`\`
${displayContent}
\`\`\`

</details>`;
  }

  // Handle array content (e.g., multiple result parts)
  const parts = content.map(item => {
    if (typeof item === 'object' && item !== null && 'text' in item) {
      return (item as { text: string }).text;
    }
    return JSON.stringify(item, null, 2);
  });

  const combined = parts.join('\n');
  const maxLength = 2000;
  const displayContent = combined.length > maxLength
    ? combined.slice(0, maxLength) + '\n... (truncated)'
    : combined;

  return `<details>
<summary>Tool Result</summary>

\`\`\`
${displayContent}
\`\`\`

</details>`;
}

/**
 * Format a summary entry (conversation metadata).
 */
function formatSummaryMessage(entry: SummaryMessage): string {
  return `---\n\n*Summary: ${entry.summary}*\n\n---`;
}

/**
 * Transform JSONL conversation content to markdown.
 *
 * @param content JSONL string from Claude Code conversation logs
 * @param maxEntries Maximum number of messages to show (default 50, 0 for unlimited)
 * @returns Formatted markdown string
 *
 * @example
 * const markdown = jsonlToMarkdown(`
 * {"type":"user","message":{"content":"What's the bug?"}}
 * {"type":"assistant","message":{"content":[{"type":"text","text":"Looking..."}]}}
 * `);
 */
export function jsonlToMarkdown(content: string, maxEntries: number = 50): string {
  // Early bail-out for empty or very short content
  if (!content || typeof content !== 'string' || content.length < 10) {
    return '';
  }

  // Pre-truncate lines to reduce parse cost on large files
  // Use 3x maxEntries as buffer since not all lines become entries (some are filtered)
  const maxLinesToParse = maxEntries > 0 ? maxEntries * 3 : 0;

  // Check if content is large (heuristic: >100KB likely has many messages)
  // Avoid expensive split() just to count lines
  const isLikelyLargeFile = content.length > 100_000;

  let entries = parseConversationEntries(content, maxLinesToParse);

  if (entries.length === 0) {
    return '';
  }

  // Further limit entries if we still have too many after parsing
  let truncationNote = '';
  if (maxEntries > 0 && entries.length > maxEntries) {
    entries = entries.slice(-maxEntries);
    truncationNote = `*Showing last ${maxEntries} messages (large conversation)...*\n\n---\n\n`;
  } else if (isLikelyLargeFile && maxLinesToParse > 0) {
    truncationNote = `*Showing recent messages (large conversation)...*\n\n---\n\n`;
  }

  const formattedParts: string[] = [];

  // Find the last 3 assistant messages to expand their thinking blocks
  const expandThinkingSet = new Set<number>();
  let foundCount = 0;
  for (let i = entries.length - 1; i >= 0 && foundCount < 3; i--) {
    if (entries[i].type === 'assistant') {
      expandThinkingSet.add(i);
      foundCount++;
    }
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    switch (entry.type) {
      case 'user':
        formattedParts.push(formatUserMessage(entry as UserMessage));
        break;

      case 'assistant':
        // Expand thinking blocks in the last 3 assistant messages
        formattedParts.push(formatAssistantMessage(entry as AssistantMessage, expandThinkingSet.has(i)));
        break;

      case 'summary':
        formattedParts.push(formatSummaryMessage(entry as SummaryMessage));
        break;
    }
  }

  return truncationNote + formattedParts.join('\n\n---\n\n');
}
