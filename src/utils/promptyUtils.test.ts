import { describe, it, expect } from 'vitest';
import {
  parsePrompty,
  substituteVariables,
  isPromptyFile,
  parseContentToSegments,
  getFieldProgress,
  getFieldOrder,
} from './promptyUtils';

describe('parsePrompty', () => {
  describe('frontmatter parsing', () => {
    it('parses frontmatter from prompty file', () => {
      const input = `---
name: Test Prompt
description: A test prompt
model: claude-3-opus
---
Hello {{name}}!`;

      const result = parsePrompty(input);
      expect(result.frontmatter).toEqual({
        name: 'Test Prompt',
        description: 'A test prompt',
        model: 'claude-3-opus',
      });
      expect(result.content).toBe('Hello {{name}}!');
    });

    it('handles missing frontmatter', () => {
      const input = 'Just content with {{variable}}';
      const result = parsePrompty(input);
      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe(input);
    });
  });

  describe('variable detection', () => {
    it('detects simple variables', () => {
      const input = `---
name: Test
---
Hello {{name}}, welcome to {{place}}!`;

      const result = parsePrompty(input);
      expect(result.variables).toHaveLength(2);
      expect(result.variables[0]).toEqual({ name: 'name' });
      expect(result.variables[1]).toEqual({ name: 'place' });
    });

    it('detects variables with hints', () => {
      const input = `---
name: Test
---
Enter your {{name:Your full name}} and {{email:Valid email address}}`;

      const result = parsePrompty(input);
      expect(result.variables).toEqual([
        { name: 'name', hint: 'Your full name' },
        { name: 'email', hint: 'Valid email address' },
      ]);
    });

    it('detects variables with dropdown options', () => {
      const input = `---
name: Test
---
Select {{size:small|medium|large}} and {{color:red|blue|green}}`;

      const result = parsePrompty(input);
      expect(result.variables).toEqual([
        { name: 'size', options: ['small', 'medium', 'large'] },
        { name: 'color', options: ['red', 'blue', 'green'] },
      ]);
    });

    it('deduplicates repeated variables', () => {
      const input = `---
name: Test
---
Hello {{name}}, nice to meet you {{name}}!`;

      const result = parsePrompty(input);
      expect(result.variables).toHaveLength(1);
      expect(result.variables[0]).toEqual({ name: 'name' });
    });

    it('handles mixed variable types', () => {
      const input = `---
name: Test
---
{{simple}} - {{withHint:enter value}} - {{dropdown:a|b|c}}`;

      const result = parsePrompty(input);
      expect(result.variables).toEqual([
        { name: 'simple' },
        { name: 'withHint', hint: 'enter value' },
        { name: 'dropdown', options: ['a', 'b', 'c'] },
      ]);
    });

    it('trims whitespace in variable names and hints', () => {
      const input = '{{ name : hint text }}';
      const result = parsePrompty(input);
      expect(result.variables).toEqual([{ name: 'name', hint: 'hint text' }]);
    });
  });
});

describe('substituteVariables', () => {
  it('substitutes simple variables', () => {
    const content = 'Hello {{name}}, welcome!';
    const values = { name: 'Alice' };
    expect(substituteVariables(content, values)).toBe('Hello Alice, welcome!');
  });

  it('substitutes variables with hints', () => {
    const content = 'Hello {{name:enter name}}!';
    const values = { name: 'Bob' };
    expect(substituteVariables(content, values)).toBe('Hello Bob!');
  });

  it('substitutes multiple occurrences of same variable', () => {
    const content = '{{name}} said hello. {{name}} then left.';
    const values = { name: 'Carol' };
    expect(substituteVariables(content, values)).toBe('Carol said hello. Carol then left.');
  });

  it('substitutes multiple different variables', () => {
    const content = '{{greeting}} {{name}}!';
    const values = { greeting: 'Hello', name: 'Dave' };
    expect(substituteVariables(content, values)).toBe('Hello Dave!');
  });

  it('leaves unmatched variables unchanged', () => {
    const content = 'Hello {{name}} and {{other}}';
    const values = { name: 'Eve' };
    expect(substituteVariables(content, values)).toBe('Hello Eve and {{other}}');
  });

  it('handles empty values', () => {
    const content = 'Value: {{value}}';
    const values = { value: '' };
    expect(substituteVariables(content, values)).toBe('Value: ');
  });
});

describe('isPromptyFile', () => {
  it('returns true for .prompty files', () => {
    expect(isPromptyFile('test.prompty')).toBe(true);
    expect(isPromptyFile('/path/to/file.prompty')).toBe(true);
    expect(isPromptyFile('my.test.prompty')).toBe(true);
  });

  it('returns true for uppercase extension', () => {
    expect(isPromptyFile('test.PROMPTY')).toBe(true);
    expect(isPromptyFile('test.Prompty')).toBe(true);
  });

  it('returns false for other extensions', () => {
    expect(isPromptyFile('test.md')).toBe(false);
    expect(isPromptyFile('prompty.txt')).toBe(false);
    expect(isPromptyFile('test.prompty.bak')).toBe(false);
  });
});

describe('parseContentToSegments', () => {
  it('parses text-only content', () => {
    const result = parseContentToSegments('Just plain text');
    expect(result).toEqual([{ type: 'text', content: 'Just plain text' }]);
  });

  it('parses field-only content', () => {
    const result = parseContentToSegments('{{name}}');
    expect(result).toEqual([{ type: 'field', content: 'name' }]);
  });

  it('parses mixed text and fields', () => {
    const result = parseContentToSegments('Hello {{name}}, welcome!');
    expect(result).toEqual([
      { type: 'text', content: 'Hello ' },
      { type: 'field', content: 'name' },
      { type: 'text', content: ', welcome!' },
    ]);
  });

  it('includes hints in field segments', () => {
    const result = parseContentToSegments('Enter {{name:Your full name}}');
    expect(result).toEqual([
      { type: 'text', content: 'Enter ' },
      { type: 'field', content: 'name', hint: 'Your full name' },
    ]);
  });

  it('includes options in field segments', () => {
    const result = parseContentToSegments('Select {{size:small|medium|large}}');
    expect(result).toEqual([
      { type: 'text', content: 'Select ' },
      { type: 'field', content: 'size', options: ['small', 'medium', 'large'] },
    ]);
  });

  it('handles multiple fields in sequence', () => {
    const result = parseContentToSegments('{{first}}{{second}}');
    expect(result).toEqual([
      { type: 'field', content: 'first' },
      { type: 'field', content: 'second' },
    ]);
  });

  it('handles empty content', () => {
    const result = parseContentToSegments('');
    expect(result).toEqual([]);
  });
});

describe('getFieldProgress', () => {
  const variables = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

  it('returns 0% when no fields filled', () => {
    const result = getFieldProgress(variables, {});
    expect(result).toEqual({ filled: 0, total: 3, percentage: 0 });
  });

  it('returns partial progress', () => {
    const result = getFieldProgress(variables, { a: 'value' });
    expect(result).toEqual({ filled: 1, total: 3, percentage: 33 });
  });

  it('returns 100% when all fields filled', () => {
    const result = getFieldProgress(variables, { a: '1', b: '2', c: '3' });
    expect(result).toEqual({ filled: 3, total: 3, percentage: 100 });
  });

  it('ignores whitespace-only values', () => {
    const result = getFieldProgress(variables, { a: 'value', b: '   ', c: '' });
    expect(result).toEqual({ filled: 1, total: 3, percentage: 33 });
  });

  it('returns 100% for empty variable list', () => {
    const result = getFieldProgress([], {});
    expect(result).toEqual({ filled: 0, total: 0, percentage: 100 });
  });
});

describe('getFieldOrder', () => {
  it('returns fields in order of appearance', () => {
    const content = '{{first}} then {{second}} and {{third}}';
    expect(getFieldOrder(content)).toEqual(['first', 'second', 'third']);
  });

  it('deduplicates fields keeping first occurrence', () => {
    const content = '{{a}} {{b}} {{a}} {{c}} {{b}}';
    expect(getFieldOrder(content)).toEqual(['a', 'b', 'c']);
  });

  it('handles fields with hints', () => {
    const content = '{{name:hint}} and {{email:another hint}}';
    expect(getFieldOrder(content)).toEqual(['name', 'email']);
  });

  it('returns empty array for content without fields', () => {
    expect(getFieldOrder('No fields here')).toEqual([]);
  });
});
