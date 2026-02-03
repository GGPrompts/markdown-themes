import { describe, it, expect } from 'vitest';
import { parseFrontmatter, formatDate } from './frontmatter';

describe('parseFrontmatter', () => {
  describe('basic parsing', () => {
    it('parses simple key-value frontmatter', () => {
      const input = `---
title: Hello World
model: claude-3
---
# Content here`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter).toEqual({
        title: 'Hello World',
        model: 'claude-3',
      });
      expect(result.content).toBe('# Content here');
    });

    it('returns null frontmatter when none present', () => {
      const input = '# Just content\n\nNo frontmatter here.';
      const result = parseFrontmatter(input);
      expect(result.frontmatter).toBeNull();
      expect(result.content).toBe(input);
    });

    it('handles empty input', () => {
      expect(parseFrontmatter('')).toEqual({ frontmatter: null, content: '' });
      expect(parseFrontmatter(null as unknown as string)).toEqual({
        frontmatter: null,
        content: '',
      });
      expect(parseFrontmatter(undefined as unknown as string)).toEqual({
        frontmatter: null,
        content: '',
      });
    });
  });

  describe('YAML types', () => {
    it('parses inline arrays', () => {
      const input = `---
tags: [typescript, react, testing]
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter?.tags).toEqual(['typescript', 'react', 'testing']);
    });

    it('parses quoted strings', () => {
      const input = `---
title: "Hello, World!"
description: 'Single quoted'
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter?.title).toBe('Hello, World!');
      expect(result.frontmatter?.description).toBe('Single quoted');
    });

    it('parses booleans', () => {
      const input = `---
active: true
disabled: false
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter?.active).toBe(true);
      expect(result.frontmatter?.disabled).toBe(false);
    });

    it('parses numbers', () => {
      const input = `---
count: 42
price: 19.99
negative: -5
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter?.count).toBe(42);
      expect(result.frontmatter?.price).toBe(19.99);
      expect(result.frontmatter?.negative).toBe(-5);
    });

    it('parses null values', () => {
      const input = `---
empty:
explicit: null
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter?.empty).toBeNull();
      expect(result.frontmatter?.explicit).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles CRLF line endings', () => {
      const input = '---\r\ntitle: Test\r\n---\r\nContent';
      const result = parseFrontmatter(input);
      expect(result.frontmatter?.title).toBe('Test');
      expect(result.content).toBe('Content');
    });

    it('ignores YAML comments', () => {
      const input = `---
title: Test
# This is a comment
model: claude
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter).toEqual({
        title: 'Test',
        model: 'claude',
      });
    });

    it('ignores lines without key-value format', () => {
      const input = `---
title: Valid
not a valid line
also: valid
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter).toEqual({
        title: 'Valid',
        also: 'valid',
      });
    });

    it('strips quotes from array items', () => {
      const input = `---
tags: ["quoted", 'single', unquoted]
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter?.tags).toEqual(['quoted', 'single', 'unquoted']);
    });

    it('handles empty arrays', () => {
      const input = `---
tags: []
---
Content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter?.tags).toEqual([]);
    });

    it('frontmatter must start at beginning of file', () => {
      const input = `Some text first
---
title: Not frontmatter
---
More content`;

      const result = parseFrontmatter(input);
      expect(result.frontmatter).toBeNull();
      expect(result.content).toBe(input);
    });
  });
});

describe('formatDate', () => {
  it('formats ISO date strings', () => {
    // Use a date with explicit time to avoid timezone edge cases
    const result = formatDate('2024-01-15T12:00:00');
    expect(result).toMatch(/Jan.*15.*2024/);
  });

  it('formats full ISO datetime strings', () => {
    const result = formatDate('2024-12-25T10:30:00Z');
    // Note: exact output depends on timezone, but should contain the date parts
    expect(result).toMatch(/Dec.*2024/);
  });

  it('returns null for undefined/empty input', () => {
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate('')).toBeNull();
  });

  it('returns original string for invalid dates', () => {
    expect(formatDate('not a date')).toBe('not a date');
    expect(formatDate('invalid-date-format')).toBe('invalid-date-format');
  });
});
