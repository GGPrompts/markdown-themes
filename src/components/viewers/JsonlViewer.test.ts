import { describe, it, expect } from 'vitest';
import { parseJsonlContent } from './JsonlViewer';

describe('parseJsonlContent', () => {
  it('parses valid JSONL with multiple lines', () => {
    const content = `{"name": "Alice", "age": 30}
{"name": "Bob", "age": 25}
{"name": "Charlie", "age": 35}`;

    const result = parseJsonlContent(content);

    expect(result).toHaveLength(3);
    expect(result[0].data).toEqual({ name: 'Alice', age: 30 });
    expect(result[0].error).toBeNull();
    expect(result[1].data).toEqual({ name: 'Bob', age: 25 });
    expect(result[2].data).toEqual({ name: 'Charlie', age: 35 });
  });

  it('skips empty lines', () => {
    const content = `{"a": 1}

{"b": 2}

{"c": 3}`;

    const result = parseJsonlContent(content);

    expect(result).toHaveLength(3);
    expect(result[0].data).toEqual({ a: 1 });
    expect(result[1].data).toEqual({ b: 2 });
    expect(result[2].data).toEqual({ c: 3 });
  });

  it('handles parse errors on individual lines', () => {
    const content = `{"valid": true}
{invalid json}
{"also_valid": true}`;

    const result = parseJsonlContent(content);

    expect(result).toHaveLength(3);
    expect(result[0].data).toEqual({ valid: true });
    expect(result[0].error).toBeNull();
    expect(result[1].data).toBeNull();
    expect(result[1].error).toBeTruthy();
    expect(result[2].data).toEqual({ also_valid: true });
    expect(result[2].error).toBeNull();
  });

  it('handles arrays as valid JSON lines', () => {
    const content = `[1, 2, 3]
["a", "b", "c"]
{"key": "value"}`;

    const result = parseJsonlContent(content);

    expect(result).toHaveLength(3);
    expect(result[0].data).toEqual([1, 2, 3]);
    expect(result[1].data).toEqual(['a', 'b', 'c']);
    expect(result[2].data).toEqual({ key: 'value' });
  });

  it('handles primitive JSON values', () => {
    const content = `"just a string"
42
true
null`;

    const result = parseJsonlContent(content);

    expect(result).toHaveLength(4);
    expect(result[0].data).toBe('just a string');
    expect(result[1].data).toBe(42);
    expect(result[2].data).toBe(true);
    expect(result[3].data).toBeNull();
    expect(result[3].error).toBeNull(); // null is valid JSON, not an error
  });

  it('returns empty array for empty content', () => {
    const result = parseJsonlContent('');
    expect(result).toHaveLength(0);
  });

  it('returns empty array for whitespace-only content', () => {
    const result = parseJsonlContent('   \n\n   \n');
    expect(result).toHaveLength(0);
  });

  it('preserves original line indices in id field', () => {
    const content = `{"first": 1}

{"third": 3}`;

    const result = parseJsonlContent(content);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(0); // Line 0
    expect(result[1].id).toBe(2); // Line 2 (skipping empty line 1)
  });

  it('handles nested objects and arrays', () => {
    const content = `{"user": {"name": "Alice", "roles": ["admin", "user"]}}
{"items": [{"id": 1}, {"id": 2}]}`;

    const result = parseJsonlContent(content);

    expect(result).toHaveLength(2);
    expect(result[0].data).toEqual({
      user: { name: 'Alice', roles: ['admin', 'user'] },
    });
    expect(result[1].data).toEqual({
      items: [{ id: 1 }, { id: 2 }],
    });
  });

  it('handles lines with leading/trailing whitespace', () => {
    const content = `  {"a": 1}
	{"b": 2}	`;

    const result = parseJsonlContent(content);

    expect(result).toHaveLength(2);
    expect(result[0].data).toEqual({ a: 1 });
    expect(result[1].data).toEqual({ b: 2 });
  });
});
