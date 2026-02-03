import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchFileTree, fetchFileContent, type FileTreeNode as APIFileTreeNode } from '../lib/api';
import { parsePrompty, type PromptyFrontmatter } from '../utils/promptyUtils';

// Sidebar width constraints
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 400;

interface PromptLibraryProps {
  homePath?: string;       // e.g., "/home/marci" - for ~/.prompts
  projectPath?: string;    // e.g., "/home/marci/projects/markdown-themes" - for .prompts
  onSelectPrompt: (path: string) => void;
  selectedPath?: string;
  /** Width of the sidebar in pixels (default: 280) */
  width?: number;
  /** Callback when sidebar width changes during drag */
  onWidthChange?: (width: number) => void;
  /** Callback when drag ends - use for persisting the final width */
  onWidthChangeEnd?: (width: number) => void;
}


interface PromptFileInfo {
  path: string;
  name: string;
  frontmatter: PromptyFrontmatter | null;
  isLoading: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  promptInfo?: PromptFileInfo;
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
  // Allow .prompts folder specifically (the root we're scanning)
  if (name === '.prompts') {
    return true;
  }
  if (name.startsWith('.') && !name.startsWith('.env')) {
    return false;
  }
  return !excludedNames.has(name);
}

function isPromptyFile(name: string): boolean {
  return /\.prompty$/i.test(name);
}

/**
 * Convert API file tree to our format, filtering for .prompty files
 */
function convertTree(node: APIFileTreeNode): TreeNode | null {
  if (!shouldInclude(node.name)) {
    return null;
  }

  if (node.type === 'directory') {
    const children = (node.children || [])
      .map(convertTree)
      .filter((child): child is TreeNode => child !== null);

    // Only include directories that have prompty files (directly or nested)
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
    // Only include .prompty files
    if (!isPromptyFile(node.name)) {
      return null;
    }
    return {
      name: node.name,
      path: node.path,
      isDirectory: false,
      promptInfo: {
        path: node.path,
        name: node.name.replace(/\.prompty$/i, ''),
        frontmatter: null,
        isLoading: true,
      },
    };
  }
}

/**
 * Sort nodes: directories first, then files, both alphabetically
 */
function sortTree(nodes: TreeNode[]): TreeNode[] {
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

/**
 * Collect all file paths from tree
 */
function collectFilePaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.isDirectory && node.children) {
      paths.push(...collectFilePaths(node.children));
    } else if (!node.isDirectory) {
      paths.push(node.path);
    }
  }
  return paths;
}

/**
 * Update tree with frontmatter data
 */
function updateTreeWithFrontmatter(
  nodes: TreeNode[],
  frontmatterMap: Map<string, PromptyFrontmatter | null>
): TreeNode[] {
  return nodes.map((node) => {
    if (node.isDirectory && node.children) {
      return {
        ...node,
        children: updateTreeWithFrontmatter(node.children, frontmatterMap),
      };
    }
    if (node.promptInfo && frontmatterMap.has(node.path)) {
      const fm = frontmatterMap.get(node.path);
      return {
        ...node,
        promptInfo: {
          ...node.promptInfo,
          frontmatter: fm ?? null,
          name: fm?.name || node.promptInfo.name,
          isLoading: false,
        },
      };
    }
    return node;
  });
}

/**
 * Filter tree nodes by search query
 */
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query.trim()) return nodes;

  const lowerQuery = query.toLowerCase();

  return nodes
    .map((node) => {
      if (node.isDirectory && node.children) {
        const filteredChildren = filterTree(node.children, query);
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      }

      // Check file name and frontmatter
      const nameMatch = node.name.toLowerCase().includes(lowerQuery);
      const fmName = node.promptInfo?.frontmatter?.name?.toLowerCase() || '';
      const fmDesc = node.promptInfo?.frontmatter?.description?.toLowerCase() || '';

      if (nameMatch || fmName.includes(lowerQuery) || fmDesc.includes(lowerQuery)) {
        return node;
      }
      return null;
    })
    .filter((node): node is TreeNode => node !== null);
}

// Tree item component
interface TreeItemProps {
  node: TreeNode;
  selectedPath?: string;
  onSelect: (path: string) => void;
  depth: number;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}

function TreeItem({
  node,
  selectedPath,
  onSelect,
  depth,
  expandedFolders,
  onToggleFolder,
}: TreeItemProps) {
  const isSelected = node.path === selectedPath;
  const isExpanded = expandedFolders.has(node.path);
  const paddingLeft = 12 + depth * 16;

  if (node.isDirectory) {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.path)}
          className="w-full text-left py-1.5 pr-2 flex items-center gap-1.5 text-sm transition-colors"
          style={{
            paddingLeft,
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <span
            className="w-4 h-4 flex items-center justify-center transition-transform"
            style={{
              color: 'var(--text-secondary)',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            <ChevronIcon />
          </span>
          <span className="w-4 h-4 flex items-center justify-center">
            <FolderIcon open={isExpanded} />
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node with metadata
  return (
    <button
      onClick={() => onSelect(node.path)}
      className="w-full text-left py-2 pr-2 flex flex-col gap-0.5 text-sm transition-colors"
      style={{
        paddingLeft: paddingLeft + 20,
        backgroundColor: isSelected
          ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
          : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          <PromptyIcon />
        </span>
        <span
          className="truncate"
          style={{
            color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
            fontWeight: isSelected ? 500 : 400,
          }}
        >
          {node.promptInfo?.frontmatter?.name || node.promptInfo?.name || node.name}
        </span>
      </div>
      {node.promptInfo?.frontmatter?.description && (
        <span
          className="text-xs truncate ml-5"
          style={{ color: 'var(--text-secondary)' }}
        >
          {node.promptInfo.frontmatter.description}
        </span>
      )}
    </button>
  );
}

/**
 * Load a prompt source (global or project)
 */
async function loadPromptSource(
  sourcePath: string,
  onUpdate: (tree: TreeNode[], frontmatterMap: Map<string, PromptyFrontmatter | null>) => void
): Promise<{ tree: TreeNode[]; isEmpty: boolean }> {
  const apiTree = await fetchFileTree(sourcePath, 5, true); // showHidden=true to see .prompts
  const converted = convertTree(apiTree);
  const children = converted?.children || [];
  const sorted = sortTree(children);

  // Load frontmatter for all prompty files
  const filePaths = collectFilePaths(sorted);
  const frontmatterMap = new Map<string, PromptyFrontmatter | null>();

  // Load frontmatter in parallel (with limit)
  const loadBatch = async (paths: string[]) => {
    const results = await Promise.allSettled(
      paths.map(async (path) => {
        try {
          const { content } = await fetchFileContent(path);
          const { frontmatter } = parsePrompty(content);
          return { path, frontmatter };
        } catch {
          return { path, frontmatter: null };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        frontmatterMap.set(result.value.path, result.value.frontmatter);
      }
    }
  };

  // Process in batches of 5
  const batchSize = 5;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    await loadBatch(batch);
  }

  // Update with frontmatter
  const updatedTree = updateTreeWithFrontmatter(sorted, frontmatterMap);
  onUpdate(updatedTree, frontmatterMap);

  return { tree: updatedTree, isEmpty: sorted.length === 0 };
}

/**
 * Count prompty files in tree
 */
function countPromptyFiles(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.isDirectory && node.children) {
      count += countPromptyFiles(node.children);
    } else if (!node.isDirectory) {
      count++;
    }
  }
  return count;
}

// Section header component for collapsible sections
interface SectionHeaderProps {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  isEmpty: boolean;
}

function SectionHeader({ label, count, isExpanded, onToggle, isEmpty }: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
      }}
    >
      <span
        className="w-4 h-4 flex items-center justify-center transition-transform"
        style={{
          color: 'var(--text-secondary)',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}
      >
        <ChevronIcon />
      </span>
      <span className="font-medium flex-1">{label}</span>
      {isEmpty ? (
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>(empty)</span>
      ) : (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
            color: 'var(--accent)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function PromptLibrary({ homePath, projectPath, onSelectPrompt, selectedPath, width = 280, onWidthChange, onWidthChangeEnd }: PromptLibraryProps) {
  // Resize state
  const isDraggingRef = useRef(false);
  const currentWidthRef = useRef(width);

  // Keep ref in sync with prop
  useEffect(() => {
    currentWidthRef.current = width;
  }, [width]);

  // Handle drag resize
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Calculate new width based on mouse position
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, moveEvent.clientX));
      currentWidthRef.current = newWidth;
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Persist the final width
      onWidthChangeEnd?.(currentWidthRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onWidthChange, onWidthChangeEnd]);

  // State for global prompts (~/.prompts)
  const [globalTree, setGlobalTree] = useState<TreeNode[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalEmpty, setGlobalEmpty] = useState(true);
  const [globalExpanded, setGlobalExpanded] = useState(true);

  // State for project prompts (.prompts)
  const [projectTree, setProjectTree] = useState<TreeNode[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectEmpty, setProjectEmpty] = useState(true);
  const [projectExpanded, setProjectExpanded] = useState(true);

  // Shared state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load global prompts (~/.prompts)
  const loadGlobalPrompts = useCallback(async () => {
    if (!homePath) return;

    const globalPromptsPath = `${homePath}/.prompts`;
    setGlobalLoading(true);
    setGlobalError(null);

    try {
      const { tree, isEmpty } = await loadPromptSource(globalPromptsPath, (updatedTree) => {
        setGlobalTree(updatedTree);
      });
      setGlobalTree(tree);
      setGlobalEmpty(isEmpty);

      // Auto-expand first level folders
      const firstLevelFolders = tree
        .filter((n) => n.isDirectory)
        .map((n) => n.path);
      setExpandedFolders((prev) => new Set([...prev, ...firstLevelFolders]));
    } catch (err) {
      // Folder might not exist - that's OK
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('ENOENT') || message.includes('not found') || message.includes('does not exist')) {
        setGlobalEmpty(true);
        setGlobalTree([]);
      } else {
        setGlobalError(message);
      }
    } finally {
      setGlobalLoading(false);
    }
  }, [homePath]);

  // Load project prompts (.prompts)
  const loadProjectPrompts = useCallback(async () => {
    if (!projectPath) return;

    const projectPromptsPath = `${projectPath}/.prompts`;
    setProjectLoading(true);
    setProjectError(null);

    try {
      const { tree, isEmpty } = await loadPromptSource(projectPromptsPath, (updatedTree) => {
        setProjectTree(updatedTree);
      });
      setProjectTree(tree);
      setProjectEmpty(isEmpty);

      // Auto-expand first level folders
      const firstLevelFolders = tree
        .filter((n) => n.isDirectory)
        .map((n) => n.path);
      setExpandedFolders((prev) => new Set([...prev, ...firstLevelFolders]));
    } catch (err) {
      // Folder might not exist - that's OK
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('ENOENT') || message.includes('not found') || message.includes('does not exist')) {
        setProjectEmpty(true);
        setProjectTree([]);
      } else {
        setProjectError(message);
      }
    } finally {
      setProjectLoading(false);
    }
  }, [projectPath]);

  // Load trees on mount / path changes
  useEffect(() => {
    loadGlobalPrompts();
  }, [loadGlobalPrompts]);

  useEffect(() => {
    loadProjectPrompts();
  }, [loadProjectPrompts]);

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Filter trees by search query
  const filteredGlobalTree = useMemo(() => {
    return filterTree(globalTree, debouncedQuery);
  }, [globalTree, debouncedQuery]);

  const filteredProjectTree = useMemo(() => {
    return filterTree(projectTree, debouncedQuery);
  }, [projectTree, debouncedQuery]);

  // Count files
  const globalCount = useMemo(() => countPromptyFiles(filteredGlobalTree), [filteredGlobalTree]);
  const projectCount = useMemo(() => countPromptyFiles(filteredProjectTree), [filteredProjectTree]);

  const isLoading = globalLoading || projectLoading;
  const hasGlobalSource = !!homePath;
  const hasProjectSource = !!projectPath;
  const hasNoSources = !hasGlobalSource && !hasProjectSource;
  const hasNoResults = debouncedQuery && globalCount === 0 && projectCount === 0;
  const hasNoPrompts = !debouncedQuery && globalEmpty && projectEmpty;

  return (
    <aside
      className="flex flex-col h-full overflow-hidden relative flex-shrink-0"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_SIDEBAR_WIDTH}px`,
        maxWidth: `${MAX_SIDEBAR_WIDTH}px`,
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5"
        style={{
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <span
          className="text-sm font-medium truncate block"
          style={{ color: 'var(--text-primary)' }}
        >
          Prompt Library
        </span>
      </div>

      {/* Search input */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="relative">
          <span
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-secondary)' }}
          >
            <SearchIcon />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts..."
            className="w-full pl-8 pr-3 py-1.5 text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded"
              style={{ color: 'var(--text-secondary)' }}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {/* File tree sections - mr-2 creates space for drag handle */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden mr-2">
        {isLoading && globalLoading && projectLoading && (
          <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading...
          </p>
        )}

        {hasNoSources && (
          <p className="px-3 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No prompt sources configured.
          </p>
        )}

        {hasNoResults && (
          <p className="px-3 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No matching prompts
          </p>
        )}

        {hasNoPrompts && !isLoading && (
          <p className="px-3 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No .prompty files found
          </p>
        )}

        {/* Global Prompts Section (~/.prompts) */}
        {hasGlobalSource && !hasNoResults && !hasNoPrompts && (
          <div>
            <SectionHeader
              label="Global Prompts"
              count={globalCount}
              isExpanded={globalExpanded}
              onToggle={() => setGlobalExpanded(!globalExpanded)}
              isEmpty={globalEmpty}
            />
            {globalExpanded && (
              <div className="py-1">
                {globalLoading && (
                  <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Loading...
                  </p>
                )}
                {globalError && (
                  <p className="px-3 py-2 text-sm text-red-500">{globalError}</p>
                )}
                {!globalLoading && !globalError && filteredGlobalTree.length === 0 && (
                  <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {debouncedQuery ? 'No matches' : 'No prompts in ~/.prompts'}
                  </p>
                )}
                {!globalLoading && !globalError && filteredGlobalTree.length > 0 && (
                  filteredGlobalTree.map((node) => (
                    <TreeItem
                      key={node.path}
                      node={node}
                      selectedPath={selectedPath}
                      onSelect={onSelectPrompt}
                      depth={0}
                      expandedFolders={expandedFolders}
                      onToggleFolder={handleToggleFolder}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Project Prompts Section (.prompts) */}
        {hasProjectSource && !hasNoResults && !hasNoPrompts && (
          <div>
            <SectionHeader
              label="Project Prompts"
              count={projectCount}
              isExpanded={projectExpanded}
              onToggle={() => setProjectExpanded(!projectExpanded)}
              isEmpty={projectEmpty}
            />
            {projectExpanded && (
              <div className="py-1">
                {projectLoading && (
                  <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Loading...
                  </p>
                )}
                {projectError && (
                  <p className="px-3 py-2 text-sm text-red-500">{projectError}</p>
                )}
                {!projectLoading && !projectError && filteredProjectTree.length === 0 && (
                  <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {debouncedQuery ? 'No matches' : 'No prompts in .prompts'}
                  </p>
                )}
                {!projectLoading && !projectError && filteredProjectTree.length > 0 && (
                  filteredProjectTree.map((node) => (
                    <TreeItem
                      key={node.path}
                      node={node}
                      selectedPath={selectedPath}
                      onSelect={onSelectPrompt}
                      depth={0}
                      expandedFolders={expandedFolders}
                      onToggleFolder={handleToggleFolder}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drag handle for resizing - positioned in the mr-2 gap */}
      <div
        className="absolute top-0 right-0 w-2 h-full group"
        style={{ cursor: 'col-resize' }}
        onMouseDown={handleDragStart}
      >
        {/* Visual indicator on hover - thin line on the right edge */}
        <div
          className="absolute inset-y-0 right-0 w-0.5 transition-colors group-hover:bg-[var(--accent)]"
          style={{ backgroundColor: 'var(--border)' }}
        />
      </div>
    </aside>
  );
}

// Icons
function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4.5 2.5L8 6L4.5 9.5" />
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>
  );
}

function PromptyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export type { PromptLibraryProps };
