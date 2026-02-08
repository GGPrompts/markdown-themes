import { describe, it, expect } from 'vitest';
import { matchesFilter, filterFiles, countMatches, CLAUDE_CODE_PATTERNS, PROMPTS_PATTERNS, MARKDOWN_PATTERNS, MEDIA_PATTERNS, CONFIG_PATTERNS } from './filters';
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

  describe('extension/suffix patterns', () => {
    it('matches files ending with extension pattern', () => {
      expect(matchesFilter('/project/my-prompt.prompty', ['.prompty'])).toBe(true);
      expect(matchesFilter('/project/prompts/test.prompty', ['.prompty'])).toBe(true);
    });

    it('does not match files without the extension', () => {
      expect(matchesFilter('/project/prompty.txt', ['.prompty'])).toBe(false);
      expect(matchesFilter('/project/readme.md', ['.prompty'])).toBe(false);
    });

    it('still matches exact file names starting with dot', () => {
      // .mcp.json should match exactly, not as a suffix
      expect(matchesFilter('/project/.mcp.json', ['.mcp.json'])).toBe(true);
      expect(matchesFilter('/project/my.mcp.json', ['.mcp.json'])).toBe(false);
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

  it('does not match standalone JSONL files (moved to conversations filter)', () => {
    // .jsonl extension was moved out of CLAUDE_CODE_PATTERNS into the dedicated conversations filter
    // Note: JSONL files under .claude/ still match due to the .claude/ directory pattern
    expect(matchesFilter('/project/logs/data.jsonl', CLAUDE_CODE_PATTERNS)).toBe(false);
    expect(matchesFilter('/home/user/data/export.jsonl', CLAUDE_CODE_PATTERNS)).toBe(false);
  });
});

describe('PROMPTS_PATTERNS', () => {
  it('matches expected prompt files', () => {
    const testCases = [
      { path: '/project/.prompts/test.prompty', expected: true },
      { path: '/project/.prompts/subdir/prompt.prompty', expected: true },
      { path: '/project/prompts/my-prompt.prompty', expected: true },
      { path: '/home/user/.prompts/global.prompty', expected: true },
      { path: '/project/src/index.ts', expected: false },
      { path: '/project/readme.md', expected: false },
      { path: '/project/prompty.txt', expected: false },
    ];

    for (const { path, expected } of testCases) {
      expect(matchesFilter(path, PROMPTS_PATTERNS)).toBe(expected);
    }
  });

  it('matches .prompts directory and its contents', () => {
    expect(matchesFilter('/project/.prompts', PROMPTS_PATTERNS)).toBe(true);
    expect(matchesFilter('/project/.prompts/readme.md', PROMPTS_PATTERNS)).toBe(true);
  });
});

describe('MARKDOWN_PATTERNS', () => {
  it('matches markdown files', () => {
    const testCases = [
      { path: '/project/README.md', expected: true },
      { path: '/project/docs/guide.md', expected: true },
      { path: '/project/components/Button.mdx', expected: true },
      { path: '/project/CLAUDE.md', expected: true },
      { path: '/project/src/index.ts', expected: false },
      { path: '/project/readme.txt', expected: false },
      { path: '/project/markdown.js', expected: false },
    ];

    for (const { path, expected } of testCases) {
      expect(matchesFilter(path, MARKDOWN_PATTERNS)).toBe(expected);
    }
  });
});

describe('MEDIA_PATTERNS', () => {
  it('matches image files', () => {
    const testCases = [
      { path: '/project/logo.png', expected: true },
      { path: '/project/assets/photo.jpg', expected: true },
      { path: '/project/images/animation.gif', expected: true },
      { path: '/project/icons/icon.webp', expected: true },
      { path: '/project/icons/icon.svg', expected: true },
    ];

    for (const { path, expected } of testCases) {
      expect(matchesFilter(path, MEDIA_PATTERNS)).toBe(expected);
    }
  });

  it('matches video files', () => {
    const testCases = [
      { path: '/project/video.mp4', expected: true },
      { path: '/project/media/clip.webm', expected: true },
      { path: '/project/videos/recording.mov', expected: true },
    ];

    for (const { path, expected } of testCases) {
      expect(matchesFilter(path, MEDIA_PATTERNS)).toBe(expected);
    }
  });

  it('matches audio files', () => {
    const testCases = [
      { path: '/project/audio.mp3', expected: true },
      { path: '/project/sounds/effect.wav', expected: true },
      { path: '/project/music/track.ogg', expected: true },
    ];

    for (const { path, expected } of testCases) {
      expect(matchesFilter(path, MEDIA_PATTERNS)).toBe(expected);
    }
  });

  it('does not match non-media files', () => {
    const testCases = [
      { path: '/project/src/index.ts', expected: false },
      { path: '/project/readme.md', expected: false },
      { path: '/project/config.json', expected: false },
    ];

    for (const { path, expected } of testCases) {
      expect(matchesFilter(path, MEDIA_PATTERNS)).toBe(expected);
    }
  });
});

describe('CONFIG_PATTERNS', () => {
  it('matches config files', () => {
    const testCases = [
      { path: '/project/package.json', expected: true },
      { path: '/project/tsconfig.json', expected: true },
      { path: '/project/config.yaml', expected: true },
      { path: '/project/docker-compose.yml', expected: true },
      { path: '/project/Cargo.toml', expected: true },
      { path: '/project/.env', expected: true },
      { path: '/project/.env.local', expected: false }, // .env.local has two dots, treated as exact match
      { path: '/project/src/index.ts', expected: false },
      { path: '/project/readme.md', expected: false },
    ];

    for (const { path, expected } of testCases) {
      expect(matchesFilter(path, CONFIG_PATTERNS)).toBe(expected);
    }
  });
});
