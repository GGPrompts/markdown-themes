import { useState, useCallback } from 'react';
import { fetchFileTree, type FileTreeNode as APIFileTreeNode } from '../lib/api';

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
}

interface UseWorkspaceResult {
  workspacePath: string | null;
  fileTree: FileTreeNode[];
  loading: boolean;
  error: string | null;
  openWorkspace: (path: string) => Promise<boolean>;
  closeWorkspace: () => void;
  refreshWorkspace: () => Promise<void>;
}

// Files/folders to exclude from the tree
const excludedNames = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.DS_Store',
  'Thumbs.db',
  '.idea',
  '.vscode',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
]);

function shouldInclude(name: string): boolean {
  // Exclude hidden files/folders (starting with .) except common config files
  if (name.startsWith('.') && !name.startsWith('.env')) {
    return false;
  }
  return !excludedNames.has(name);
}

/**
 * Convert API file tree to our format, including all viewable files
 */
function convertTree(node: APIFileTreeNode): FileTreeNode | null {
  if (!shouldInclude(node.name)) {
    return null;
  }

  if (node.type === 'directory') {
    // Recursively convert children
    const children = (node.children || [])
      .map(convertTree)
      .filter((child): child is FileTreeNode => child !== null);

    // Only include directories that have files (directly or nested)
    if (children.length > 0) {
      return {
        name: node.name,
        path: node.path,
        isDirectory: true,
        children,
      };
    }
    return null;
  } else {
    // Include all files
    return {
      name: node.name,
      path: node.path,
      isDirectory: false,
    };
  }
}

/**
 * Sort nodes: directories first, then files, both alphabetically
 */
function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortTree(node.children) : undefined,
    }))
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
}

export function useWorkspace(): UseWorkspaceResult {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (path: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Fetch file tree from TabzChrome API
      const apiTree = await fetchFileTree(path, 5, false);

      // Convert API tree to our format
      const converted = convertTree(apiTree);
      const children = converted?.children || [];

      // Sort the tree
      const sorted = sortTree(children);

      setFileTree(sorted);
      setWorkspacePath(path);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to read workspace: ${message}`);
      setFileTree([]);
      setWorkspacePath(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const openWorkspace = useCallback(
    async (path: string): Promise<boolean> => {
      return await loadWorkspace(path);
    },
    [loadWorkspace]
  );

  const closeWorkspace = useCallback(() => {
    setWorkspacePath(null);
    setFileTree([]);
    setError(null);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    if (workspacePath) {
      await loadWorkspace(workspacePath);
    }
  }, [workspacePath, loadWorkspace]);

  return {
    workspacePath,
    fileTree,
    loading,
    error,
    openWorkspace,
    closeWorkspace,
    refreshWorkspace,
  };
}
