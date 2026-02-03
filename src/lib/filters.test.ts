import { describe, it, expect } from 'vitest';
import { matchesFilter, filterFiles, countMatches, CLAUDE_CODE_PATTERNS } from './filters';
import type { FileTreeNode } from '../context/WorkspaceContext';

// Helper to create file nodes
function file(path: string, name?: string): FileTreeNode {
  return {
    path,
    name: name ?? path.split('/').pop() ?? '',
    isDirectory: false,
  };
}

// Helper to create directory nodes
function dir(path: string, children: FileTreeNode[] = [], name?: string): FileTreeNode {
  return {
    path,
    name: name ?? path.split('/').pop() ?? '',
    isDirectory: true,
    children,
  };
}

describe('matchesFilter', () => {
  describe('file patterns', () => {
    it('matches exact file names', () => {
      expect(matchesFilter('/project/CLAUDE.md', ['CLAUDE.md'])).toBe(true);
      expect(matchesFilter('/project/.mcp.json', ['.mcp.json'])).toBe(true);
    });

    it('does not match partial file names', () => {
      expect(matchesFilter('/project/CLAUDE.md.bak', ['CLAUDE.md'])).toBe(false);
      expect(matchesFilter('/project/my-CLAUDE.md', ['CLAUDE.md'])).toBe(false);
    });

    it('matches files in nested directories', () => {
      expect(matchesFilter('/project/docs/sub/CLAUDE.md', ['CLAUDE.md'])).toBe(true);
    });
  });

  describe('directory patterns', () => {
    it('matches directory names with trailing slash pattern', () => {
      expect(matchesFilter('/project/.claude', ['.claude/'])).toBe(true);
      expect(matchesFilter('/project/.claude/hooks', ['.claude/'])).toBe(true);
      expect(matchesFilter('/project/.claude/settings.json', ['.claude/'])).toBe(true);
    });

    it('does not match files that only contain directory name', () => {
      expect(matchesFilter('/project/.claude-file', ['.claude/'])).toBe(false);
    });
  });

  describe('multiple patterns', () => {
    it('matches any pattern in array', () => {
      const patterns = ['CLAUDE.md', '.mcp.json', '.claude/'];
      expect(matchesFilter('/project/CLAUDE.md', patterns)).toBe(true);
      expect(matchesFilter('/project/.mcp.json', patterns)).toBe(true);
      expect(matchesFilter('/project/.claude/hooks', patterns)).toBe(true);
    });

    it('returns false when no patterns match', () => {
      expect(matchesFilter('/project/readme.md', ['CLAUDE.md'])).toBe(false);
    });
  });

  describe('path normalization', () => {
    it('handles Windows-style paths', () => {
      expect(matchesFilter('C:\\project\\CLAUDE.md', ['CLAUDE.md'])).toBe(true);
      expect(matchesFilter('C:\\project\\.claude\\hooks', ['.claude/'])).toBe(true);
    });
  });
});

describe('filterFiles', () => {
  it('filters files matching patterns', () => {
    const files: FileTreeNode[] = [
      file('/project/CLAUDE.md'),
      file('/project/readme.md'),
      file('/project/.mcp.json'),
    ];

    const result = filterFiles(files, ['CLAUDE.md', '.mcp.json']);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toEqual(['CLAUDE.md', '.mcp.json']);
  });

  it('preserves parent directories of matching files', () => {
    const files: FileTreeNode[] = [
      dir('/project/docs', [
        file('/project/docs/CLAUDE.md'),
        file('/project/docs/other.md'),
      ]),
    ];

    const result = filterFiles(files, ['CLAUDE.md']);
    expect(result).toHaveLength(1);
    expect(result[0].isDirectory).toBe(true);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children?.[0].name).toBe('CLAUDE.md');
  });

  it('recursively filters nested directories', () => {
    const files: FileTreeNode[] = [
      dir('/project/a', [
        dir('/project/a/b', [
          file('/project/a/b/CLAUDE.md'),
          file('/project/a/b/other.md'),
        ]),
        file('/project/a/readme.md'),
      ]),
    ];

    const result = filterFiles(files, ['CLAUDE.md']);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children?.[0].children).toHaveLength(1);
    expect(result[0].children?.[0].children?.[0].name).toBe('CLAUDE.md');
  });

  it('includes directories that match patterns', () => {
    const files: FileTreeNode[] = [
      dir('/project/.claude', [
        file('/project/.claude/settings.json'),
        dir('/project/.claude/hooks', [file('/project/.claude/hooks/pre-commit')]),
      ]),
    ];

    const result = filterFiles(files, ['.claude/']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('.claude');
    // All contents preserved since parent matches
    expect(result[0].children).toHaveLength(2);
  });

  it('excludes directories with no matching descendants', () => {
    const files: FileTreeNode[] = [
      dir('/project/src', [
        file('/project/src/index.ts'),
        file('/project/src/app.ts'),
      ]),
      dir('/project/docs', [file('/project/docs/CLAUDE.md')]),
    ];

    const result = filterFiles(files, ['CLAUDE.md']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('docs');
  });

  it('returns empty array when no matches', () => {
    const files: FileTreeNode[] = [
      file('/project/readme.md'),
      file('/project/index.ts'),
    ];

    const result = filterFiles(files, ['CLAUDE.md']);
    expect(result).toEqual([]);
  });
});

describe('countMatches', () => {
  it('counts matching files', () => {
    const files: FileTreeNode[] = [
      file('/project/CLAUDE.md'),
      file('/project/readme.md'),
      file('/project/.mcp.json'),
    ];

    expect(countMatches(files, ['CLAUDE.md', '.mcp.json'])).toBe(2);
  });

  it('counts matching directories as 1', () => {
    const files: FileTreeNode[] = [
      dir('/project/.claude', [
        file('/project/.claude/settings.json'),
        file('/project/.claude/other.json'),
      ]),
    ];

    // Directory itself matches, count as 1 (not its contents)
    expect(countMatches(files, ['.claude/'])).toBe(1);
  });

  it('counts nested matches when directory does not match', () => {
    const files: FileTreeNode[] = [
      dir('/project/docs', [
        file('/project/docs/CLAUDE.md'),
        file('/project/docs/other.md'),
        dir('/project/docs/sub', [file('/project/docs/sub/CLAUDE.md')]),
      ]),
    ];

    expect(countMatches(files, ['CLAUDE.md'])).toBe(2);
  });

  it('returns 0 when no matches', () => {
    const files: FileTreeNode[] = [
      file('/project/readme.md'),
      file('/project/index.ts'),
    ];

    expect(countMatches(files, ['CLAUDE.md'])).toBe(0);
  });
});

describe('CLAUDE_CODE_PATTERNS', () => {
  it('matches expected Claude Code files', () => {
    const testCases = [
      { path: '/project/.claude/settings.json', expected: true },
      { path: '/project/.claude/hooks/pre-commit', expected: true },
      { path: '/project/CLAUDE.md', expected: true },
      { path: '/project/.mcp.json', expected: true },
      { path: '/project/.claudeignore', expected: true },
      { path: '/project/src/index.ts', expected: false },
      { path: '/project/readme.md', expected: false },
    ];

    for (const { path, expected } of testCases) {
      expect(matchesFilter(path, CLAUDE_CODE_PATTERNS)).toBe(expected);
    }
  });
});
