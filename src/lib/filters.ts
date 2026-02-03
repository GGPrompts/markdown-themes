/**
 * File filter definitions and matching logic for the Sidebar.
 */

import type { FileTreeNode } from '../context/WorkspaceContext';

/**
 * Patterns to match Claude Code configuration files.
 * Patterns ending with "/" match directory names.
 * Other patterns match file names exactly or as suffixes.
 */
export const CLAUDE_CODE_PATTERNS = [
  '.claude/',         // Claude config directory (includes hooks/, settings.json)
  '.claude.json',     // User-level config (conversation history, etc.)
  'CLAUDE.md',        // Project instructions
  '.mcp.json',        // MCP server config
  '.claudeignore',    // Ignore patterns
];

/**
 * Patterns to match prompt files.
 */
export const PROMPTS_PATTERNS = [
  '.prompts/',        // Prompts directory
  '.prompty',         // Prompty file extension (suffix match)
];

export type FilterId = 'claude-code' | 'prompts';

/**
 * Scope for merged file tree display
 */
export type FileScope = 'project' | 'user';

/**
 * Home directory paths to include for each filter.
 * These paths are relative to the user's home directory.
 */
export interface FilterHomePaths {
  /** Paths relative to home directory (e.g., '.claude' for ~/.claude) */
  relativePaths: string[];
}

export interface FilterDefinition {
  id: FilterId;
  name: string;
  /** Patterns to match in project directory */
  patterns: string[];
  /** Optional home directory paths to include */
  homePaths?: FilterHomePaths;
}

export const FILTERS: FilterDefinition[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    patterns: CLAUDE_CODE_PATTERNS,
    homePaths: {
      relativePaths: ['.claude', '.claude.json'],  // ~/.claude, ~/.claude.json
    },
  },
  {
    id: 'prompts',
    name: 'Prompts',
    patterns: PROMPTS_PATTERNS,
    homePaths: {
      relativePaths: ['.prompts'],  // ~/.prompts
    },
  },
];

/**
 * Check if a pattern is a simple extension (e.g., ".prompty") vs an exact hidden filename (e.g., ".mcp.json").
 * Extension patterns have only one dot at the beginning.
 */
function isExtensionPattern(pattern: string): boolean {
  if (!pattern.startsWith('.')) return false;
  // Count dots in the pattern
  const dotCount = (pattern.match(/\./g) || []).length;
  // If only one dot at the start, it's an extension pattern
  return dotCount === 1;
}

/**
 * Check if a file or directory path matches any of the given patterns.
 *
 * Pattern types:
 * - Ends with "/" - Directory pattern (e.g., ".claude/" matches any .claude directory)
 * - Starts with "." and has only one dot - Extension/suffix pattern (e.g., ".prompty" matches files ending with .prompty)
 * - Other - Exact filename match (e.g., "CLAUDE.md", ".mcp.json" matches files named exactly)
 *
 * @param path - The full path to check
 * @param patterns - Array of patterns to match against
 * @returns true if the path matches any pattern
 */
export function matchesFilter(path: string, patterns: string[]): boolean {
  // Normalize path separators to forward slashes
  const normalizedPath = path.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  const fileName = segments[segments.length - 1];

  for (const pattern of patterns) {
    if (pattern.endsWith('/')) {
      // Directory pattern - check if any segment matches
      const dirName = pattern.slice(0, -1);
      if (segments.some((seg) => seg === dirName)) {
        return true;
      }
    } else if (isExtensionPattern(pattern)) {
      // Extension/suffix pattern (e.g., ".prompty") - check if filename ends with pattern
      if (fileName.endsWith(pattern)) {
        return true;
      }
    } else {
      // File pattern - check if filename matches exactly
      if (fileName === pattern) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a node or any of its descendants match the filter patterns.
 * Used to determine if a directory should be shown (because it contains matching files).
 */
function nodeOrDescendantsMatch(node: FileTreeNode, patterns: string[]): boolean {
  if (matchesFilter(node.path, patterns)) {
    return true;
  }

  if (node.isDirectory && node.children) {
    return node.children.some((child) => nodeOrDescendantsMatch(child, patterns));
  }

  return false;
}

/**
 * Filter a file tree to only include nodes that match the given patterns.
 * Parent directories are preserved if they contain matching descendants.
 *
 * @param files - The file tree to filter
 * @param patterns - Array of patterns to match against
 * @returns A new file tree with only matching nodes
 */
export function filterFiles(files: FileTreeNode[], patterns: string[]): FileTreeNode[] {
  const result: FileTreeNode[] = [];

  for (const node of files) {
    if (node.isDirectory) {
      // For directories, check if they or their descendants match
      if (nodeOrDescendantsMatch(node, patterns)) {
        // Recursively filter children
        const filteredChildren = node.children
          ? filterFiles(node.children, patterns)
          : undefined;

        result.push({
          ...node,
          children: filteredChildren,
        });
      }
    } else {
      // For files, only include if they match
      if (matchesFilter(node.path, patterns)) {
        result.push(node);
      }
    }
  }

  return result;
}

/**
 * Count the number of matching files and directories in a file tree.
 * For directories that directly match a pattern (like .claude/), counts the directory itself.
 * For other directories, recursively counts matching files inside.
 */
export function countMatches(files: FileTreeNode[], patterns: string[]): number {
  let count = 0;

  for (const node of files) {
    if (node.isDirectory) {
      // If the directory itself matches (e.g., .claude/), count it as 1
      if (matchesFilter(node.path, patterns)) {
        count++;
      } else if (node.children) {
        // Otherwise, count matching items inside
        count += countMatches(node.children, patterns);
      }
    } else if (matchesFilter(node.path, patterns)) {
      count++;
    }
  }

  return count;
}
