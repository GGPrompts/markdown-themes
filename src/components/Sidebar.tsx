import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { FileTreeNode } from '../context/WorkspaceContext';
import { useFileFilter, type ScopedFileTreeNode } from '../hooks/useFileFilter';
import { FILTERS, type FilterId } from '../lib/filters';
import { getFileIconInfo } from '../utils/fileIcons';

interface SidebarProps {
  fileTree: FileTreeNode[];
  currentFile: string | null;
  workspacePath: string | null;
  /** User's home directory path for fetching user-level config files */
  homePath?: string;
  isSplit?: boolean;
  /** Width of the sidebar in pixels (default: 250) */
  width?: number;
  /** Callback when sidebar width changes during drag */
  onWidthChange?: (width: number) => void;
  /** Callback when drag ends - use for persisting the final width */
  onWidthChangeEnd?: (width: number) => void;
  onFileSelect: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  onRightFileSelect?: (path: string) => void;
}

interface TreeItemProps {
  node: ScopedFileTreeNode;
  currentFile: string | null;
  isSplit?: boolean;
  onFileSelect: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  onRightFileSelect?: (path: string) => void;
  depth: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedPaths: Set<string>;
  onToggleExpandPath: (path: string) => void;
}

function TreeItem({ node, currentFile, isSplit, onFileSelect, onFileDoubleClick, onRightFileSelect, depth, isExpanded, onToggleExpand, expandedPaths, onToggleExpandPath }: TreeItemProps) {
  const isSelected = node.path === currentFile;
  const paddingLeft = 12 + depth * 16;

  // Scope header nodes (Project / User (~)) get special styling
  if (node.isScopeHeader) {
    return (
      <div>
        <button
          onClick={onToggleExpand}
          className="w-full text-left py-2 pr-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors"
          style={{
            paddingLeft: 12,
            color: 'var(--accent)',
            backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
            borderBottom: '1px solid var(--border)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent) 15%, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent) 8%, transparent)';
          }}
        >
          <span
            className="w-4 h-4 flex items-center justify-center transition-transform"
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            <ChevronIcon />
          </span>
          <span className="w-4 h-4 flex items-center justify-center">
            {node.scope === 'project' ? <ProjectIcon /> : <HomeIcon />}
          </span>
          <span>{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child as ScopedFileTreeNode}
                currentFile={currentFile}
                isSplit={isSplit}
                onFileSelect={onFileSelect}
                onFileDoubleClick={onFileDoubleClick}
                onRightFileSelect={onRightFileSelect}
                depth={0}
                isExpanded={expandedPaths.has(child.path)}
                onToggleExpand={() => onToggleExpandPath(child.path)}
                expandedPaths={expandedPaths}
                onToggleExpandPath={onToggleExpandPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (node.isDirectory) {
    return (
      <div>
        <button
          onClick={onToggleExpand}
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
                node={child as ScopedFileTreeNode}
                currentFile={currentFile}
                isSplit={isSplit}
                onFileSelect={onFileSelect}
                onFileDoubleClick={onFileDoubleClick}
                onRightFileSelect={onRightFileSelect}
                depth={depth + 1}
                isExpanded={expandedPaths.has(child.path)}
                onToggleExpand={() => onToggleExpandPath(child.path)}
                expandedPaths={expandedPaths}
                onToggleExpandPath={onToggleExpandPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    // Ctrl+click (or Cmd+click on Mac) opens in right pane when split view is active
    if (isSplit && (e.ctrlKey || e.metaKey) && onRightFileSelect) {
      onRightFileSelect(node.path);
    } else {
      onFileSelect(node.path);
    }
  };

  return (
    <button
      onClick={handleClick}
      onDoubleClick={() => onFileDoubleClick?.(node.path)}
      className="w-full text-left py-1.5 pr-2 flex items-center gap-1.5 text-sm transition-colors"
      style={{
        paddingLeft: paddingLeft + 20,
        backgroundColor: isSelected ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
        fontWeight: isSelected ? 500 : 400,
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
      title={isSplit ? 'Click to open, Ctrl+click to open in right pane' : undefined}
    >
      <FileIcon path={node.path} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// Helper to collect all directory paths from a file tree
function getAllDirectoryPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  const traverse = (node: FileTreeNode) => {
    if (node.isDirectory) {
      paths.push(node.path);
      node.children?.forEach(traverse);
    }
  };
  nodes.forEach(traverse);
  return paths;
}

// Filter tree nodes by search query (matches file/folder names)
function filterTreeBySearch<T extends FileTreeNode>(nodes: T[], query: string): T[] {
  if (!query.trim()) return nodes;

  const lowerQuery = query.toLowerCase();

  const filterNode = (node: T): T | null => {
    const nameMatches = node.name.toLowerCase().includes(lowerQuery);

    if (node.isDirectory && node.children) {
      const filteredChildren = node.children
        .map((child) => filterNode(child as T))
        .filter((child): child is T => child !== null);

      // Include directory if it has matching children or its name matches
      if (filteredChildren.length > 0 || nameMatches) {
        return { ...node, children: filteredChildren };
      }
      return null;
    }

    // For files, include if name matches
    return nameMatches ? node : null;
  };

  return nodes.map(filterNode).filter((node): node is T => node !== null);
}

// Sidebar width constraints
const MIN_SIDEBAR_WIDTH = 150;
const MAX_SIDEBAR_WIDTH = 400;

export function Sidebar({ fileTree, currentFile, workspacePath, homePath, isSplit, width = 250, onWidthChange, onWidthChangeEnd, onFileSelect, onFileDoubleClick, onRightFileSelect }: SidebarProps) {
  const workspaceName = workspacePath?.split('/').pop() ?? workspacePath?.split('\\').pop() ?? 'Workspace';
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
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

  const {
    activeFilter,
    setFilter,
    clearFilter,
    filteredFiles,
    matchCount,
    isFiltered,
    homeLoading,
  } = useFileFilter({ files: fileTree, homePath });

  // Apply search filter on top of the preset filter
  const searchFilteredFiles = useMemo(() => {
    return filterTreeBySearch(filteredFiles, searchQuery);
  }, [filteredFiles, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  // Expanded state management - start with all directories expanded
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    return new Set(getAllDirectoryPaths(fileTree));
  });

  // Update expanded paths when file tree changes (e.g., new directories added)
  // Also auto-expand scope headers and filtered home files
  useEffect(() => {
    const allDirs = getAllDirectoryPaths(fileTree);
    const filteredDirs = getAllDirectoryPaths(filteredFiles);
    setExpandedPaths(prev => {
      // Add any new directories that aren't in the set yet (keep them expanded by default)
      const next = new Set(prev);
      [...allDirs, ...filteredDirs].forEach(path => {
        if (!prev.has(path)) {
          next.add(path);
        }
      });
      return next;
    });
  }, [fileTree, filteredFiles]);

  const toggleExpandPath = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedPaths(new Set([...getAllDirectoryPaths(fileTree), ...getAllDirectoryPaths(filteredFiles)]));
  };

  const collapseAll = () => {
    setExpandedPaths(new Set());
  };

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        filterMenuOpen &&
        filterButtonRef.current &&
        filterMenuRef.current &&
        !filterButtonRef.current.contains(event.target as Node) &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setFilterMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterMenuOpen]);

  const handleFilterSelect = (filterId: FilterId | null) => {
    if (filterId === null) {
      clearFilter();
    } else {
      setFilter(filterId);
    }
    setFilterMenuOpen(false);
  };

  return (
    <aside
      className="flex flex-col h-full relative flex-shrink-0"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_SIDEBAR_WIDTH}px`,
        maxWidth: `${MAX_SIDEBAR_WIDTH}px`,
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header - z-10 keeps it above scrolling file tree but below toolbar dropdowns (z-100) */}
      <div
        className="flex items-center justify-between px-3 py-2.5 relative z-10"
        style={{
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <span
          className="text-sm font-medium truncate"
          style={{ color: 'var(--text-primary)' }}
          title={workspacePath ?? ''}
        >
          {workspaceName}
        </span>
        <div className="flex items-center gap-1">
          {/* Expand all button */}
          <button
            onClick={expandAll}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Expand all folders"
          >
            <ExpandAllIcon />
          </button>

          {/* Collapse all button */}
          <button
            onClick={collapseAll}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Collapse all folders"
          >
            <CollapseAllIcon />
          </button>

          {/* Filter button */}
          <div className="relative">
            <button
              ref={filterButtonRef}
              onClick={() => setFilterMenuOpen(!filterMenuOpen)}
              className="w-6 h-6 flex items-center justify-center rounded transition-colors"
              style={{
                color: isFiltered ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: isFiltered ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isFiltered) {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isFiltered) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
              title={isFiltered ? `Filter: ${FILTERS.find(f => f.id === activeFilter)?.name}` : 'Filter files'}
            >
              <FilterIcon />
            </button>

            {/* Filter dropdown menu */}
            {filterMenuOpen && (
              <div
                ref={filterMenuRef}
                className="absolute top-full left-0 mt-1 py-1 rounded-md z-[100] min-w-[160px]"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -4px rgba(0, 0, 0, 0.15)',
                }}
              >
                {/* Clear filter option */}
                <button
                  onClick={() => handleFilterSelect(null)}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors"
                  style={{
                    color: !isFiltered ? 'var(--accent)' : 'var(--text-primary)',
                    backgroundColor: !isFiltered ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = !isFiltered
                      ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                      : 'transparent';
                  }}
                >
                  <span className="w-4">
                    {!isFiltered && <CheckIcon />}
                  </span>
                  All Files
                </button>

                <div
                  className="my-1"
                  style={{ borderTop: '1px solid var(--border)' }}
                />

                {/* Filter presets */}
                {FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => handleFilterSelect(filter.id)}
                    className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors"
                    style={{
                      color: activeFilter === filter.id ? 'var(--accent)' : 'var(--text-primary)',
                      backgroundColor: activeFilter === filter.id
                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                        : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = activeFilter === filter.id
                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                        : 'transparent';
                    }}
                  >
                    <span className="w-4">
                      {activeFilter === filter.id && <CheckIcon />}
                    </span>
                    {filter.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter indicator bar */}
      {isFiltered && (
        <div
          className="flex items-center justify-between px-3 py-1.5 text-xs"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            borderBottom: '1px solid var(--border)',
            color: 'var(--accent)',
          }}
        >
          <span className="flex items-center gap-1.5">
            {FILTERS.find(f => f.id === activeFilter)?.name}: {matchCount} file{matchCount !== 1 ? 's' : ''}
            {homeLoading && (
              <span className="opacity-70">(loading...)</span>
            )}
          </span>
          <button
            onClick={clearFilter}
            className="hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Clear
          </button>
        </div>
      )}

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
            placeholder="Search files..."
            className="w-full pl-8 pr-8 py-1.5 text-sm outline-none"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {searchFilteredFiles.length === 0 ? (
          <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {isSearching ? 'No matching files' : isFiltered ? 'No matching files' : 'No markdown files found'}
          </p>
        ) : (
          searchFilteredFiles.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              currentFile={currentFile}
              isSplit={isSplit}
              onFileSelect={onFileSelect}
              onFileDoubleClick={onFileDoubleClick}
              onRightFileSelect={onRightFileSelect}
              depth={0}
              isExpanded={expandedPaths.has(node.path)}
              onToggleExpand={() => toggleExpandPath(node.path)}
              expandedPaths={expandedPaths}
              onToggleExpandPath={toggleExpandPath}
            />
          ))
        )}
      </div>

      {/* Drag handle for resizing */}
      <div
        className="absolute top-0 right-0 w-1 h-full group"
        style={{ cursor: 'col-resize' }}
        onMouseDown={handleDragStart}
      >
        {/* Wider invisible hit area - only extends left into sidebar, not right into content */}
        <div className="absolute inset-y-0 -left-2 right-0" />
        {/* Visual indicator on hover */}
        <div
          className="absolute inset-y-0 left-0 right-0 transition-colors group-hover:bg-[var(--accent)]"
          style={{ backgroundColor: 'transparent' }}
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

function FileIcon({ path }: { path: string }) {
  const { icon: Icon, color } = getFileIconInfo(path);
  return (
    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
      <Icon size={14} style={{ color }} />
    </span>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ExpandAllIcon() {
  // ChevronsDown icon - double chevrons pointing down
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
    </svg>
  );
}

function CollapseAllIcon() {
  // ChevronsUp icon - double chevrons pointing up
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 11l-5-5-5 5M17 18l-5-5-5 5" />
    </svg>
  );
}

function ProjectIcon() {
  // Briefcase/project icon
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function HomeIcon() {
  // Home icon for user scope
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
