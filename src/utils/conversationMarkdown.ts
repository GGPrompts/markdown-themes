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
 * Parse JSONL content into conversation entries.
 * Filters for user/assistant/summary types only.
 */
function parseConversationEntries(content: string): ConversationEntry[] {
  const entries: ConversationEntry[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as ConversationEntry;
      if (parsed.type === 'user' || parsed.type === 'assistant' || parsed.type === 'summary') {
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
 */
function formatAssistantMessage(entry: AssistantMessage): string {
  const content = entry.message.content;

  if (typeof content === 'string') {
    return `## Assistant\n\n${content}`;
  }

  const parts: string[] = ['## Assistant'];

  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push(block.text);
        break;

      case 'thinking':
        parts.push(formatThinkingBlock(block.thinking));
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
 */
function formatThinkingBlock(thinking: string): string {
  return `<details>
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
  if (!content || typeof content !== 'string') {
    return '';
  }

  let entries = parseConversationEntries(content);

  if (entries.length === 0) {
    return '';
  }

  // Limit to most recent entries to prevent performance issues
  const totalEntries = entries.length;
  let truncationNote = '';
  if (maxEntries > 0 && entries.length > maxEntries) {
    entries = entries.slice(-maxEntries);
    truncationNote = `*Showing last ${maxEntries} of ${totalEntries} messages...*\n\n---\n\n`;
  }

  const formattedParts: string[] = [];

  for (const entry of entries) {
    switch (entry.type) {
      case 'user':
        formattedParts.push(formatUserMessage(entry as UserMessage));
        break;

      case 'assistant':
        formattedParts.push(formatAssistantMessage(entry as AssistantMessage));
        break;

      case 'summary':
        formattedParts.push(formatSummaryMessage(entry as SummaryMessage));
        break;
    }
  }

  return truncationNote + formattedParts.join('\n\n---\n\n');
}
