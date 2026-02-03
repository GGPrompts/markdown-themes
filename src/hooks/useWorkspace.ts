import { useState, useCallback } from 'react';
import { readDir } from '@tauri-apps/plugin-fs';

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
  openWorkspace: (path: string) => Promise<void>;
  closeWorkspace: () => void;
  refreshWorkspace: () => Promise<void>;
}

function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

async function buildFileTree(dirPath: string): Promise<FileTreeNode[]> {
  const entries = await readDir(dirPath);
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    // Skip hidden files/folders
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = `${dirPath}/${entry.name}`;

    if (entry.isDirectory) {
      // Recursively read subdirectories
      const children = await buildFileTree(fullPath);
      // Only include directories that contain markdown files (directly or nested)
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          children,
        });
      }
    } else if (isMarkdownFile(entry.name)) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: false,
      });
    }
  }

  // Sort: directories first, then files, both alphabetically
  nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export function useWorkspace(): UseWorkspaceResult {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const tree = await buildFileTree(path);
      setFileTree(tree);
      setWorkspacePath(path);
    } catch (err) {
      setError(`Failed to read workspace: ${err}`);
      setFileTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const openWorkspace = useCallback(async (path: string) => {
    await loadWorkspace(path);
  }, [loadWorkspace]);

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
