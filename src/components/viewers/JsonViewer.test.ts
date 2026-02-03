import { describe, it, expect } from 'vitest';

// Extract the stripJsonComments function for testing
// Since it's not exported, we'll test it indirectly or recreate it here
function stripJsonComments(jsonc: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < jsonc.length) {
    const char = jsonc[i];
    const next = jsonc[i + 1];

    if (inString) {
      result += char;
      if (char === '\\' && i + 1 < jsonc.length) {
        result += next;
        i += 2;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      result += char;
      i++;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < jsonc.length && jsonc[i] !== '\n') {
        i++;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < jsonc.length - 1 && !(jsonc[i] === '*' && jsonc[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

describe('stripJsonComments', () => {
  it('removes single-line comments', () => {
    const input = `{
  "key": "value" // this is a comment
}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('removes block comments', () => {
    const input = `{
  /* this is a block comment */
  "key": "value"
}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('removes inline block comments', () => {
    const input = `{
  "key": /* inline */ "value"
}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('preserves comments inside strings', () => {
    const input = `{
  "key": "value with // comment syntax",
  "other": "value with /* block */ syntax"
}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({
      key: 'value with // comment syntax',
      other: 'value with /* block */ syntax',
    });
  });

  it('handles escaped quotes in strings', () => {
    const input = `{
  "key": "value with \\"quote\\"" // comment
}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value with "quote"' });
  });

  it('handles tsconfig.json style comments', () => {
    const input = `{
  "compilerOptions": {
    "target": "ES2020",
    /* Bundler mode */
    "moduleResolution": "bundler"
  }
}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({
      compilerOptions: {
        target: 'ES2020',
        moduleResolution: 'bundler',
      },
    });
  });

  it('handles multiple comments', () => {
    const input = `{
  // First comment
  "a": 1,
  /* Block
     comment */
  "b": 2 // Trailing comment
}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  it('returns valid JSON for comment-free input', () => {
    const input = '{"key": "value"}';
    const result = stripJsonComments(input);
    expect(result).toBe(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });
});
