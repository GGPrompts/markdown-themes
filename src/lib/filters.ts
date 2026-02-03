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
  'CLAUDE.md',        // Project instructions
  '.mcp.json',        // MCP server config
  '.claudeignore',    // Ignore patterns
];

export type FilterId = 'claude-code';

export interface FilterDefinition {
  id: FilterId;
  name: string;
  patterns: string[];
}

export const FILTERS: FilterDefinition[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    patterns: CLAUDE_CODE_PATTERNS,
  },
];

/**
 * Check if a file or directory path matches any of the given patterns.
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
