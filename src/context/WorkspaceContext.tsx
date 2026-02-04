import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { fetchFileTree, type FileTreeNode as APIFileTreeNode } from '../lib/api';
import { useAppStore } from './AppStoreContext';

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
}

interface WorkspaceContextValue {
  workspacePath: string | null;
  fileTree: FileTreeNode[];
  loading: boolean;
  error: string | null;
  openWorkspace: (path: string) => Promise<boolean>;
  closeWorkspace: () => void;
  refreshWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

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

// Hidden files/folders that should be included (Claude Code, env files)
const allowedHiddenNames = new Set([
  '.env',
  '.claude',
  '.mcp.json',
  '.claudeignore',
]);

/**
 * Check if a path looks like a "projects directory" (contains repos, not a repo itself).
 * These directories need shallow loading to avoid performance issues.
 */
function isProjectsDirectory(path: string): boolean {
  // Match common patterns: ~/projects, ~/Projects, ~/repos, ~/code, ~/dev
  return /\/(projects|Projects|repos|code|dev)$/.test(path);
}

function shouldInclude(name: string): boolean {
  if (excludedNames.has(name)) {
    return false;
  }
  if (name.startsWith('.')) {
    return allowedHiddenNames.has(name);
  }
  return true;
}

function convertTree(node: APIFileTreeNode): FileTreeNode | null {
  if (!shouldInclude(node.name)) {
    return null;
  }

  if (node.type === 'directory') {
    const children = (node.children || [])
      .map(convertTree)
      .filter((child): child is FileTreeNode => child !== null);

    // Always include directories, even if empty (for shallow loading)
    return {
      name: node.name,
      path: node.path,
      isDirectory: true,
      children: children.length > 0 ? children : undefined,
    };
  } else {
    return {
      name: node.name,
      path: node.path,
      isDirectory: false,
    };
  }
}

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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { state: appState, isLoading: storeLoading, saveLastWorkspace, addRecentFolder } = useAppStore();

  const loadWorkspace = useCallback(async (path: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Use shallow depth for projects directories to avoid performance issues
      const depth = isProjectsDirectory(path) ? 1 : 5;
      const apiTree = await fetchFileTree(path, depth, false);
      const converted = convertTree(apiTree);
      const children = converted?.children || [];
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
      const success = await loadWorkspace(path);
      if (success) {
        saveLastWorkspace(path);
        addRecentFolder(path);
      }
      return success;
    },
    [loadWorkspace, saveLastWorkspace, addRecentFolder]
  );

  const closeWorkspace = useCallback(() => {
    setWorkspacePath(null);
    setFileTree([]);
    setError(null);
    saveLastWorkspace(null);
  }, [saveLastWorkspace]);

  const refreshWorkspace = useCallback(async () => {
    if (workspacePath) {
      await loadWorkspace(workspacePath);
    }
  }, [workspacePath, loadWorkspace]);

  // Restore last workspace on mount
  useEffect(() => {
    if (!storeLoading && appState.lastWorkspace && !workspacePath) {
      loadWorkspace(appState.lastWorkspace).then((success) => {
        if (!success) {
          // Path doesn't exist anymore, clear it from storage
          saveLastWorkspace(null);
        }
      });
    }
  }, [storeLoading, appState.lastWorkspace, workspacePath, loadWorkspace, saveLastWorkspace]);

  // Auto-refresh file tree every 8 seconds to catch new files
  useEffect(() => {
    if (!workspacePath) return;

    const depth = isProjectsDirectory(workspacePath) ? 1 : 5;
    const interval = setInterval(() => {
      // Silent refresh - don't set loading state to avoid UI flicker
      fetchFileTree(workspacePath, depth, false)
        .then((apiTree) => {
          const converted = convertTree(apiTree);
          const children = converted?.children || [];
          const sorted = sortTree(children);
          setFileTree(sorted);
        })
        .catch(() => {
          // Silently ignore refresh errors
        });
    }, 8000);

    return () => clearInterval(interval);
  }, [workspacePath]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspacePath,
        fileTree,
        loading,
        error,
        openWorkspace,
        closeWorkspace,
        refreshWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return context;
}
