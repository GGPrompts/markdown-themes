import { describe, it, expect } from 'vitest';
import { jsonlToMarkdown } from './conversationMarkdown';

describe('jsonlToMarkdown', () => {
  describe('basic parsing', () => {
    it('returns empty string for empty input', () => {
      expect(jsonlToMarkdown('')).toBe('');
    });

    it('returns empty string for null/undefined input', () => {
      expect(jsonlToMarkdown(null as unknown as string)).toBe('');
      expect(jsonlToMarkdown(undefined as unknown as string)).toBe('');
    });

    it('returns empty string when no valid entries', () => {
      expect(jsonlToMarkdown('invalid json\nalso invalid')).toBe('');
    });

    it('skips non-user/assistant/summary entries', () => {
      const input = `{"type":"system","message":"ignored"}
{"type":"user","message":{"content":"Hello"}}`;
      const result = jsonlToMarkdown(input);
      expect(result).toBe('## User\n\nHello');
    });

    it('handles malformed JSON lines gracefully', () => {
      const input = `{"type":"user","message":{"content":"Before"}}
{malformed json here
{"type":"user","message":{"content":"After"}}`;
      const result = jsonlToMarkdown(input);
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });
  });

  describe('user messages', () => {
    it('formats simple user message', () => {
      const input = '{"type":"user","message":{"content":"What is the bug?"}}';
      const result = jsonlToMarkdown(input);
      expect(result).toBe('## User\n\nWhat is the bug?');
    });

    it('formats user message with array content', () => {
      const input = '{"type":"user","message":{"content":[{"type":"text","text":"First part"},{"type":"text","text":"Second part"}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toBe('## User\n\nFirst part\n\nSecond part');
    });

    it('preserves markdown in user message', () => {
      const input = '{"type":"user","message":{"content":"# Heading\\n\\n- Item 1\\n- Item 2"}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('# Heading');
      expect(result).toContain('- Item 1');
    });
  });

  describe('assistant messages', () => {
    it('formats simple assistant message', () => {
      const input = '{"type":"assistant","message":{"content":"Here is the answer."}}';
      const result = jsonlToMarkdown(input);
      expect(result).toBe('## Assistant\n\nHere is the answer.');
    });

    it('formats assistant message with text block', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"text","text":"Looking at the code..."}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toBe('## Assistant\n\nLooking at the code...');
    });

    it('formats multiple text blocks', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"text","text":"First"},{"type":"text","text":"Second"}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });
  });

  describe('thinking blocks', () => {
    it('formats thinking block as details element', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Let me analyze this..."}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details');
      expect(result).toContain('<summary>Thinking</summary>');
      expect(result).toContain('Let me analyze this...');
      expect(result).toContain('</details>');
    });

    it('formats mixed text and thinking blocks', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Hmm..."},{"type":"text","text":"The answer is 42."}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details');
      expect(result).toContain('Hmm...');
      expect(result).toContain('The answer is 42.');
    });

    it('expands the last thinking block in the conversation', () => {
      // Single assistant message - the thinking block should be expanded
      const input = '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Thinking..."}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details open>');
    });

    it('only expands the last thinking block when multiple exist', () => {
      // Two assistant messages with thinking blocks - only the last one should be expanded
      const input = `{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"First thought"}]}}
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Second thought"}]}}`;
      const result = jsonlToMarkdown(input);

      // First thinking block should be collapsed
      expect(result).toContain('<details>\n<summary>Thinking</summary>\n\nFirst thought');
      // Last thinking block should be expanded
      expect(result).toContain('<details open>\n<summary>Thinking</summary>\n\nSecond thought');
    });

    it('expands last thinking block even when followed by text in same message', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"My analysis..."},{"type":"text","text":"Here is my answer."}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details open>');
      expect(result).toContain('My analysis...');
    });
  });

  describe('tool_use blocks', () => {
    it('formats tool_use block with name and input', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"read_file","input":{"path":"/test.ts"}}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('### Tool: read_file');
      expect(result).toContain('```json');
      expect(result).toContain('"path": "/test.ts"');
      expect(result).toContain('```');
    });

    it('formats tool_use with complex input', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"edit_file","input":{"path":"/test.ts","changes":[{"line":1,"content":"new"}]}}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('### Tool: edit_file');
      expect(result).toContain('"changes"');
    });
  });

  describe('tool_result blocks', () => {
    it('formats tool_result with string content', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"123","content":"File contents here"}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('<details>');
      expect(result).toContain('<summary>Tool Result</summary>');
      expect(result).toContain('File contents here');
      expect(result).toContain('</details>');
    });

    it('formats tool_result with array content', () => {
      const input = '{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"123","content":[{"text":"Result text"}]}]}}';
      const result = jsonlToMarkdown(input);
      expect(result).toContain('Result text');
    });

    it('truncates very long tool results', () => {
      const longContent = 'x'.repeat(3000);
      const input = `{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"123","content":"${longContent}"}]}}`;
      const result = jsonlToMarkdown(input);
      expect(result).toContain('... (truncated)');
      expect(result.length).toBeLessThan(longContent.length);
    });
  });

  describe('summary messages', () => {
    it('formats summary message with horizontal rules', () => {
      const input = '{"type":"summary","summary":"User asked about a bug in the login flow."}';
      const result = jsonlToMarkdown(input);
      expect(result).toBe('---\n\n*Summary: User asked about a bug in the login flow.*\n\n---');
    });
  });

  describe('conversation flow', () => {
    it('separates messages with horizontal rules', () => {
      const input = `{"type":"user","message":{"content":"Question"}}
{"type":"assistant","message":{"content":"Answer"}}`;
      const result = jsonlToMarkdown(input);
      expect(result).toBe('## User\n\nQuestion\n\n---\n\n## Assistant\n\nAnswer');
    });

    it('handles full conversation with multiple exchanges', () => {
      const input = `{"type":"user","message":{"content":"What is 2+2?"}}
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Simple math..."},{"type":"text","text":"The answer is 4."}]}}
{"type":"user","message":{"content":"Thanks!"}}
{"type":"assistant","message":{"content":"You're welcome!"}}`;
      const result = jsonlToMarkdown(input);

      expect(result).toContain('## User\n\nWhat is 2+2?');
      expect(result).toContain('<summary>Thinking</summary>');
      expect(result).toContain('The answer is 4.');
      expect(result).toContain('## User\n\nThanks!');
      expect(result).toContain("You're welcome!");

      // Check separators
      const separatorCount = (result.match(/\n\n---\n\n/g) || []).length;
      expect(separatorCount).toBe(3); // Between each message
    });

    it('handles realistic Claude Code conversation', () => {
      const input = `{"type":"user","message":{"content":"Fix the bug in auth.ts"}}
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"I need to read the file first..."},{"type":"tool_use","name":"read_file","input":{"path":"src/auth.ts"}}]}}
{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"abc123","content":"export function login() { ... }"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"I found the issue. The login function is missing error handling."}]}}`;

      const result = jsonlToMarkdown(input);

      expect(result).toContain('## User\n\nFix the bug in auth.ts');
      expect(result).toContain('<summary>Thinking</summary>');
      expect(result).toContain('### Tool: read_file');
      expect(result).toContain('<summary>Tool Result</summary>');
      expect(result).toContain('missing error handling');
    });
  });
});
