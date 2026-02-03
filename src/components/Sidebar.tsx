import { useState, useRef, useEffect } from 'react';
import type { FileTreeNode } from '../hooks/useWorkspace';
import { useFileFilter } from '../hooks/useFileFilter';
import { FILTERS } from '../lib/filters';

interface SidebarProps {
  fileTree: FileTreeNode[];
  currentFile: string | null;
  workspacePath: string | null;
  isSplit?: boolean;
  onFileSelect: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  onRightFileSelect?: (path: string) => void;
  onClose: () => void;
}

interface TreeItemProps {
  node: FileTreeNode;
  currentFile: string | null;
  isSplit?: boolean;
  onFileSelect: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  onRightFileSelect?: (path: string) => void;
  depth: number;
}

function TreeItem({ node, currentFile, isSplit, onFileSelect, onFileDoubleClick, onRightFileSelect, depth }: TreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = node.path === currentFile;
  const paddingLeft = 12 + depth * 16;

  if (node.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
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
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            <ChevronIcon />
          </span>
          <span className="w-4 h-4 flex items-center justify-center">
            <FolderIcon open={expanded} />
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                currentFile={currentFile}
                isSplit={isSplit}
                onFileSelect={onFileSelect}
                onFileDoubleClick={onFileDoubleClick}
                onRightFileSelect={onRightFileSelect}
                depth={depth + 1}
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
      <span className="w-4 h-4 flex items-center justify-center">
        <FileIcon />
      </span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function Sidebar({ fileTree, currentFile, workspacePath, isSplit, onFileSelect, onFileDoubleClick, onRightFileSelect, onClose }: SidebarProps) {
  const workspaceName = workspacePath?.split('/').pop() ?? workspacePath?.split('\\').pop() ?? 'Workspace';
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  const {
    activeFilter,
    setFilter,
    clearFilter,
    filteredFiles,
    matchCount,
    isFiltered,
  } = useFileFilter(fileTree);

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

  const handleFilterSelect = (filterId: string | null) => {
    if (filterId === null) {
      clearFilter();
    } else {
      setFilter(filterId as 'claude-code');
    }
    setFilterMenuOpen(false);
  };

  return (
    <aside
      className="w-[250px] min-w-[250px] flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
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
                className="absolute top-full left-0 mt-1 py-1 rounded-md shadow-lg z-50 min-w-[160px]"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
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

          {/* Close button */}
          <button
            onClick={onClose}
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
            title="Close workspace"
          >
            <CloseIcon />
          </button>
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
          <span>
            {FILTERS.find(f => f.id === activeFilter)?.name}: {matchCount} file{matchCount !== 1 ? 's' : ''}
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

      {/* File tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {filteredFiles.length === 0 ? (
          <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {isFiltered ? 'No matching files' : 'No markdown files found'}
          </p>
        ) : (
          filteredFiles.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              currentFile={currentFile}
              isSplit={isSplit}
              onFileSelect={onFileSelect}
              onFileDoubleClick={onFileDoubleClick}
              onRightFileSelect={onRightFileSelect}
              depth={0}
            />
          ))
        )}
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

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
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
