import { describe, it, expect } from 'vitest';
import { findFirstChangedBlock, getScrollPercentage, findFirstChangedLine, findAllChangedLines, mapLinesToBlocks } from './markdownDiff';

describe('findFirstChangedBlock', () => {
  it('returns -1 when content is identical', () => {
    const content = '# Hello\n\nWorld';
    const result = findFirstChangedBlock(content, content);
    expect(result.firstChangedBlock).toBe(-1);
  });

  it('detects change in first block', () => {
    const old = '# Hello\n\nWorld';
    const newContent = '# Hello World\n\nWorld';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(0);
  });

  it('detects change in second block', () => {
    const old = '# Hello\n\nWorld';
    const newContent = '# Hello\n\nWorld!';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(1);
  });

  it('detects added block at end', () => {
    const old = '# Hello\n\nWorld';
    const newContent = '# Hello\n\nWorld\n\nNew paragraph';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(2);
    expect(result.isAddition).toBe(true);
  });

  it('detects deleted block at end', () => {
    const old = '# Hello\n\nWorld\n\nExtra';
    const newContent = '# Hello\n\nWorld';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(1); // Last block of new content
    expect(result.isAddition).toBe(false);
  });

  it('handles code blocks as single blocks', () => {
    const old = '# Hello\n\n```js\nconst x = 1;\n```\n\nWorld';
    const newContent = '# Hello\n\n```js\nconst x = 2;\n```\n\nWorld';
    const result = findFirstChangedBlock(old, newContent);
    expect(result.firstChangedBlock).toBe(1); // Code block is block 1
  });

  it('handles empty old content', () => {
    const result = findFirstChangedBlock('', '# Hello');
    expect(result.firstChangedBlock).toBe(0);
    expect(result.isAddition).toBe(true);
  });

  it('handles empty new content', () => {
    const result = findFirstChangedBlock('# Hello', '');
    expect(result.totalBlocks).toBe(0);
  });
});

describe('getScrollPercentage', () => {
  it('returns -1 when no change', () => {
    const result = getScrollPercentage({
      firstChangedBlock: -1,
      totalBlocks: 5,
      charOffset: 0,
      isAddition: false,
    });
    expect(result).toBe(-1);
  });

  it('returns 0 for first block change', () => {
    const result = getScrollPercentage({
      firstChangedBlock: 0,
      totalBlocks: 5,
      charOffset: 0,
      isAddition: true,
    });
    expect(result).toBe(0);
  });

  it('returns correct percentage for middle block', () => {
    const result = getScrollPercentage({
      firstChangedBlock: 2,
      totalBlocks: 4,
      charOffset: 100,
      isAddition: true,
    });
    expect(result).toBe(0.5);
  });

  it('returns percentage close to 1 for last block', () => {
    const result = getScrollPercentage({
      firstChangedBlock: 4,
      totalBlocks: 5,
      charOffset: 400,
      isAddition: true,
    });
    expect(result).toBe(0.8);
  });
});

describe('findFirstChangedLine', () => {
  it('returns -1 when content is identical', () => {
    const content = 'const x = 1;\nconst y = 2;';
    const result = findFirstChangedLine(content, content);
    expect(result.firstChangedLine).toBe(-1);
  });

  it('detects change in first line', () => {
    const old = 'const x = 1;\nconst y = 2;';
    const newContent = 'const x = 100;\nconst y = 2;';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(1);
  });

  it('detects change in second line', () => {
    const old = 'const x = 1;\nconst y = 2;';
    const newContent = 'const x = 1;\nconst y = 200;';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(2);
  });

  it('detects change in middle of file', () => {
    const old = 'line1\nline2\nline3\nline4\nline5';
    const newContent = 'line1\nline2\nline3-modified\nline4\nline5';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(3);
  });

  it('detects added line at end', () => {
    const old = 'line1\nline2';
    const newContent = 'line1\nline2\nline3';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(3);
    expect(result.isAddition).toBe(true);
  });

  it('detects deleted line at end', () => {
    const old = 'line1\nline2\nline3';
    const newContent = 'line1\nline2';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(2);
    expect(result.isAddition).toBe(false);
  });

  it('handles empty old content', () => {
    const result = findFirstChangedLine('', 'line1\nline2');
    expect(result.firstChangedLine).toBe(1);
    expect(result.isAddition).toBe(true);
  });

  it('handles empty new content', () => {
    const result = findFirstChangedLine('line1\nline2', '');
    expect(result.totalLines).toBe(1); // empty string splits to ['']
    expect(result.firstChangedLine).toBe(1);
  });

  it('handles Windows line endings', () => {
    const old = 'line1\r\nline2';
    const newContent = 'line1\r\nline2-modified';
    const result = findFirstChangedLine(old, newContent);
    expect(result.firstChangedLine).toBe(2);
  });

  it('returns correct total lines', () => {
    const old = 'line1\nline2';
    const newContent = 'line1\nline2\nline3\nline4';
    const result = findFirstChangedLine(old, newContent);
    expect(result.totalLines).toBe(4);
  });
});

describe('findAllChangedLines', () => {
  it('returns empty map when content is identical', () => {
    const content = 'const x = 1;\nconst y = 2;';
    const result = findAllChangedLines(content, content);
    expect(result.changedLines.size).toBe(0);
  });

  it('marks modified line when content changes', () => {
    const old = 'const x = 1;\nconst y = 2;';
    const newContent = 'const x = 100;\nconst y = 2;';
    const result = findAllChangedLines(old, newContent);
    expect(result.changedLines.size).toBe(1);
    expect(result.changedLines.get(1)).toBe('modified');
  });

  it('marks multiple modified lines', () => {
    const old = 'line1\nline2\nline3';
    const newContent = 'LINE1\nline2\nLINE3';
    const result = findAllChangedLines(old, newContent);
    expect(result.changedLines.size).toBe(2);
    expect(result.changedLines.get(1)).toBe('modified');
    expect(result.changedLines.get(3)).toBe('modified');
  });

  it('marks added lines at end', () => {
    const old = 'line1\nline2';
    const newContent = 'line1\nline2\nline3\nline4';
    const result = findAllChangedLines(old, newContent);
    expect(result.changedLines.size).toBe(2);
    expect(result.changedLines.get(3)).toBe('added');
    expect(result.changedLines.get(4)).toBe('added');
  });

  it('marks both modified and added lines', () => {
    const old = 'line1\nline2';
    const newContent = 'LINE1\nline2\nline3';
    const result = findAllChangedLines(old, newContent);
    expect(result.changedLines.size).toBe(2);
    expect(result.changedLines.get(1)).toBe('modified');
    expect(result.changedLines.get(3)).toBe('added');
  });

  it('returns empty map when lines are deleted', () => {
    const old = 'line1\nline2\nline3';
    const newContent = 'line1\nline2';
    const result = findAllChangedLines(old, newContent);
    // Deleted lines don't show in new content, so no highlights
    expect(result.changedLines.size).toBe(0);
  });

  it('handles empty old content', () => {
    const result = findAllChangedLines('', 'line1\nline2');
    expect(result.changedLines.size).toBe(2);
    expect(result.changedLines.get(1)).toBe('added');
    expect(result.changedLines.get(2)).toBe('added');
  });

  it('handles empty new content', () => {
    const result = findAllChangedLines('line1\nline2', '');
    // Empty string splits to [''], so one line exists
    expect(result.totalLines).toBe(1);
    expect(result.changedLines.get(1)).toBe('modified');
  });

  it('handles Windows line endings', () => {
    const old = 'line1\r\nline2';
    const newContent = 'LINE1\r\nline2\r\nline3';
    const result = findAllChangedLines(old, newContent);
    expect(result.changedLines.size).toBe(2);
    expect(result.changedLines.get(1)).toBe('modified');
    expect(result.changedLines.get(3)).toBe('added');
  });

  it('returns correct total lines', () => {
    const old = 'line1\nline2';
    const newContent = 'line1\nline2\nline3\nline4\nline5';
    const result = findAllChangedLines(old, newContent);
    expect(result.totalLines).toBe(5);
  });
});

describe('mapLinesToBlocks', () => {
  it('returns blocks with no changes when no lines are changed', () => {
    const content = '# Hello\n\nWorld';
    const changedLines = new Map<number, 'added' | 'modified'>();
    const result = mapLinesToBlocks(content, changedLines);

    expect(result.length).toBe(2);
    expect(result[0].changeType).toBeUndefined();
    expect(result[1].changeType).toBeUndefined();
  });

  it('marks block as added when its line is added', () => {
    const content = '# Hello\n\nWorld\n\nNew paragraph';
    const changedLines = new Map<number, 'added' | 'modified'>([
      [5, 'added'],
    ]);
    const result = mapLinesToBlocks(content, changedLines);

    expect(result.length).toBe(3);
    expect(result[0].changeType).toBeUndefined();
    expect(result[1].changeType).toBeUndefined();
    expect(result[2].changeType).toBe('added');
  });

  it('marks block as modified when its line is modified', () => {
    const content = '# Hello\n\nWorld changed';
    const changedLines = new Map<number, 'added' | 'modified'>([
      [3, 'modified'],
    ]);
    const result = mapLinesToBlocks(content, changedLines);

    expect(result.length).toBe(2);
    expect(result[0].changeType).toBeUndefined();
    expect(result[1].changeType).toBe('modified');
  });

  it('handles multiple changed blocks', () => {
    const content = '# Changed heading\n\nSecond paragraph\n\nThird changed';
    const changedLines = new Map<number, 'added' | 'modified'>([
      [1, 'modified'],
      [5, 'added'],
    ]);
    const result = mapLinesToBlocks(content, changedLines);

    expect(result.length).toBe(3);
    expect(result[0].changeType).toBe('modified');
    expect(result[1].changeType).toBeUndefined();
    expect(result[2].changeType).toBe('added');
  });

  it('prefers added over modified when block has both', () => {
    // A multi-line block with both added and modified lines
    const content = 'Line 1\nLine 2\nLine 3';
    const changedLines = new Map<number, 'added' | 'modified'>([
      [1, 'modified'],
      [2, 'added'],
    ]);
    const result = mapLinesToBlocks(content, changedLines);

    expect(result.length).toBe(1);
    expect(result[0].changeType).toBe('added');
  });

  it('handles code blocks as single blocks', () => {
    const content = '# Title\n\n```js\nconst x = 1;\nconst y = 2;\n```\n\nAfter';
    const changedLines = new Map<number, 'added' | 'modified'>([
      [4, 'modified'], // Line inside code block
    ]);
    const result = mapLinesToBlocks(content, changedLines);

    expect(result.length).toBe(3);
    expect(result[0].changeType).toBeUndefined(); // Title
    expect(result[1].changeType).toBe('modified'); // Code block
    expect(result[2].changeType).toBeUndefined(); // After
  });

  it('returns correct line ranges for blocks', () => {
    const content = '# Title\n\nParagraph one\nwith two lines\n\nParagraph two';
    const changedLines = new Map<number, 'added' | 'modified'>();
    const result = mapLinesToBlocks(content, changedLines);

    expect(result.length).toBe(3);
    expect(result[0].lines).toEqual({ startLine: 1, endLine: 1 });
    expect(result[1].lines).toEqual({ startLine: 3, endLine: 4 });
    expect(result[2].lines).toEqual({ startLine: 6, endLine: 6 });
  });

  it('handles empty content', () => {
    const result = mapLinesToBlocks('', new Map());
    expect(result.length).toBe(0);
  });
});
