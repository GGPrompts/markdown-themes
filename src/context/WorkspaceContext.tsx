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
  /** Whether the workspace root is a git repository */
  isGitRepo: boolean;
  openWorkspace: (path: string) => Promise<boolean>;
  closeWorkspace: () => void;
  refreshWorkspace: () => Promise<void>;
  /** Paths that have been loaded (children fetched) */
  loadedPaths: Set<string>;
  /** Paths currently being loaded */
  loadingPaths: Set<string>;
  /** Lazy load children for a folder path */
  loadChildren: (folderPath: string) => Promise<void>;
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
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [loadedPaths, setLoadedPaths] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  const { state: appState, isLoading: storeLoading, saveLastWorkspace, addRecentFolder } = useAppStore();

  const loadWorkspace = useCallback(async (path: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    // Reset lazy loading state when opening a new workspace
    setLoadedPaths(new Set());
    setLoadingPaths(new Set());

    try {
      // Use shallow depth for projects directories to avoid performance issues
      const depth = isProjectsDirectory(path) ? 1 : 5;
      const apiTree = await fetchFileTree(path, depth, false);
      const converted = convertTree(apiTree);
      const children = converted?.children || [];
      const sorted = sortTree(children);

      setFileTree(sorted);
      setWorkspacePath(path);
      setIsGitRepo(apiTree.isGitRepo === true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to read workspace: ${message}`);
      setFileTree([]);
      setWorkspacePath(null);
      setIsGitRepo(false);
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
    setIsGitRepo(false);
    setLoadedPaths(new Set());
    setLoadingPaths(new Set());
    saveLastWorkspace(null);
  }, [saveLastWorkspace]);

  const refreshWorkspace = useCallback(async () => {
    if (workspacePath) {
      await loadWorkspace(workspacePath);
    }
  }, [workspacePath, loadWorkspace]);

  /**
   * Lazy load children for a folder path.
   * Fetches the folder contents and merges them into the existing tree.
   */
  const loadChildren = useCallback(async (folderPath: string): Promise<void> => {
    // Already loaded or currently loading
    if (loadedPaths.has(folderPath) || loadingPaths.has(folderPath)) {
      return;
    }

    // Mark as loading
    setLoadingPaths(prev => new Set(prev).add(folderPath));

    try {
      // Fetch just this folder with depth 1
      const apiTree = await fetchFileTree(folderPath, 1, false);
      const converted = convertTree(apiTree);
      const newChildren = converted?.children || [];
      const sortedChildren = sortTree(newChildren);

      // Merge the children into the existing tree
      setFileTree(prevTree => {
        const mergeChildren = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map(node => {
            if (node.path === folderPath && node.isDirectory) {
              // Found the target folder, update its children
              return {
                ...node,
                children: sortedChildren.length > 0 ? sortedChildren : undefined,
              };
            }
            if (node.children) {
              // Recursively search in children
              return {
                ...node,
                children: mergeChildren(node.children),
              };
            }
            return node;
          });
        };
        return mergeChildren(prevTree);
      });

      // Mark as loaded
      setLoadedPaths(prev => new Set(prev).add(folderPath));
    } catch (err) {
      console.error(`Failed to load children for ${folderPath}:`, err);
    } finally {
      // Remove from loading
      setLoadingPaths(prev => {
        const next = new Set(prev);
        next.delete(folderPath);
        return next;
      });
    }
  }, [loadedPaths, loadingPaths]);

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

          // For projects directories, preserve lazy-loaded children during refresh
          if (isProjectsDirectory(workspacePath)) {
            setFileTree(prevTree => {
              // Merge: keep existing children for folders that were lazy-loaded
              return sorted.map(newNode => {
                const existingNode = prevTree.find(n => n.path === newNode.path);
                if (existingNode?.children && newNode.isDirectory) {
                  // Preserve the lazy-loaded children
                  return { ...newNode, children: existingNode.children };
                }
                return newNode;
              });
            });
          } else {
            setFileTree(sorted);
          }
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
        isGitRepo,
        openWorkspace,
        closeWorkspace,
        refreshWorkspace,
        loadedPaths,
        loadingPaths,
        loadChildren,
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
