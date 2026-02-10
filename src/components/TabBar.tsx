import { useState } from 'react';
import { FileDiff, Users, GitBranch, GitPullRequestDraft, Keyboard, Crosshair, Columns, LayoutGrid } from 'lucide-react';
import type { Tab } from '../hooks/useTabManager';
import { getFileIconInfo } from '../utils/fileIcons';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabPin: (id: string) => void;
  onTabUnpin?: (id: string) => void;
  /** Which pane this tab bar is in - used for drag transfer between panes */
  pane?: 'left' | 'right';
  /** Path of a file currently being streamed (shows animated dot on matching tab) */
  streamingFilePath?: string | null;
  onTabContextMenu?: (e: React.MouseEvent, tab: Tab) => void;
  isGitGraph?: boolean;
  isWorkingTree?: boolean;
  isBeadsBoard?: boolean;
  onGitGraphToggle?: () => void;
  onWorkingTreeToggle?: () => void;
  onBeadsBoardToggle?: () => void;
  onHotkeysClick?: () => void;
  /** Follow AI Edits mode */
  isFollowMode?: boolean;
  onFollowModeToggle?: () => void;
  /** Active subagent count (shown when follow mode on + count > 0) */
  activeSubagentCount?: number;
  /** Split view state */
  isSplit?: boolean;
  onSplitToggle?: () => void;
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  isStreaming?: boolean;
  onSelect: () => void;
  onClose: () => void;
  onPin: () => void;
  onUnpin?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  pane: 'left' | 'right';
}

function TabItem({ tab, isActive, isStreaming, onSelect, onClose, onPin, onUnpin, onContextMenu, pane }: TabItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Display names for different tab types
  const VIEW_TAB_DISPLAY: Record<string, { name: string; tooltip: string }> = {
    'git-graph': { name: 'Git Graph', tooltip: 'Git Graph (Ctrl+G)' },
    'working-tree': { name: 'Working Tree', tooltip: 'Working Tree (Ctrl+Shift+G)' },
    'beads-board': { name: 'Beads Board', tooltip: 'Beads Board (Ctrl+Shift+B)' },
  };

  const viewInfo = VIEW_TAB_DISPLAY[tab.type];
  const displayName = viewInfo
    ? viewInfo.name
    : tab.type === 'diff' && tab.diffData
      ? `${tab.diffData.file.split('/').pop()} @ ${tab.diffData.base.substring(0, 7)}`
      : tab.type === 'conversation' && tab.conversationData
        ? tab.conversationData.taskDescription || `Subagent ${tab.conversationData.sessionId.substring(0, 8)}`
        : (tab.path.split('/').pop() ?? tab.path.split('\\').pop() ?? tab.path);

  const tooltipText = viewInfo
    ? viewInfo.tooltip
    : tab.type === 'diff' && tab.diffData
      ? `Diff: ${tab.diffData.file} (${tab.diffData.base.substring(0, 7)})`
      : tab.type === 'conversation' && tab.conversationData
        ? `Subagent conversation: ${tab.conversationData.sessionId}\nPane: ${tab.conversationData.pane}\nWorking dir: ${tab.conversationData.workingDir}`
        : tab.path;

  const handleDoubleClick = () => {
    if (tab.isPreview) {
      onPin();
    } else if (tab.isPinned && onUnpin) {
      onUnpin();
    }
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const isViewTab = tab.type === 'git-graph' || tab.type === 'working-tree' || tab.type === 'beads-board';

  const handleDragStart = (e: React.DragEvent) => {
    // Only allow dragging file and conversation tabs, not diff or view tabs
    if (tab.type === 'diff' || isViewTab) {
      e.preventDefault();
      return;
    }
    // Include pane source so drop handler can close from origin
    e.dataTransfer.setData('text/plain', `${pane}:${tab.path}`);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Show close button: always for pinned tabs, on hover for preview tabs
  const showCloseButton = tab.isPinned || isHovered;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="group flex items-center gap-1 px-3 py-2 text-sm cursor-pointer select-none min-w-0 max-w-[180px] transition-colors"
      style={{
        backgroundColor: isActive
          ? 'var(--bg-primary)'
          : isHovered
            ? 'color-mix(in srgb, var(--bg-primary) 50%, var(--bg-secondary))'
            : 'transparent',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        opacity: isDragging ? 0.5 : 1,
      }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={tooltipText}
    >
      <TabIcon tab={tab} />
      <span
        className="truncate"
        style={{
          fontStyle: tab.isPreview ? 'italic' : 'normal',
        }}
      >
        {displayName}
      </span>
      {isStreaming && (
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: 'var(--accent)' }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ backgroundColor: 'var(--accent)' }}
          />
        </span>
      )}
      {showCloseButton ? (
        <button
          className="w-4 h-4 flex items-center justify-center rounded transition-colors flex-shrink-0"
          onClick={handleCloseClick}
          style={{
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          title="Close"
        >
          <CloseIcon />
        </button>
      ) : (
        // Placeholder to keep consistent sizing
        <div className="w-4 h-4 flex-shrink-0" />
      )}
    </div>
  );
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose, onTabPin, onTabUnpin, pane = 'left', streamingFilePath, onTabContextMenu, isGitGraph, isWorkingTree, isBeadsBoard, onGitGraphToggle, onWorkingTreeToggle, onBeadsBoardToggle, onHotkeysClick, isFollowMode, onFollowModeToggle, activeSubagentCount, isSplit, onSplitToggle }: TabBarProps) {
  const hasActions = !!(onGitGraphToggle || onWorkingTreeToggle || onBeadsBoardToggle || onHotkeysClick || onFollowModeToggle || onSplitToggle);

  if (tabs.length === 0 && !hasActions) {
    return null;
  }

  return (
    <div
      className="flex items-end overflow-x-auto"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        minHeight: '40px',
      }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          isStreaming={!!streamingFilePath && tab.path === streamingFilePath}
          onSelect={() => onTabSelect(tab.id)}
          onClose={() => onTabClose(tab.id)}
          onPin={() => onTabPin(tab.id)}
          onUnpin={onTabUnpin ? () => onTabUnpin(tab.id) : undefined}
          onContextMenu={onTabContextMenu ? (e) => onTabContextMenu(e, tab) : undefined}
          pane={pane}
        />
      ))}
      {hasActions && (
        <div className="flex items-center gap-1 px-2 ml-auto flex-shrink-0 py-1">
          {/* Follow AI Edits toggle */}
          {onFollowModeToggle && (
            <button
              onClick={onFollowModeToggle}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{
                backgroundColor: isFollowMode ? 'var(--accent)' : 'transparent',
                color: isFollowMode ? 'var(--bg-primary)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isFollowMode) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isFollowMode) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
              title={isFollowMode ? 'Stop following AI edits' : 'Follow AI edits (auto-open streaming files)'}
            >
              <Crosshair size={16} />
            </button>
          )}

          {/* Active subagents indicator */}
          {isFollowMode && (activeSubagentCount ?? 0) > 0 && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
              title={`${activeSubagentCount} active subagent${(activeSubagentCount ?? 0) > 1 ? 's' : ''}`}
            >
              <Users size={12} />
              <span>{activeSubagentCount}</span>
            </div>
          )}

          {onGitGraphToggle && (
            <button
              onClick={onGitGraphToggle}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{
                backgroundColor: isGitGraph ? 'var(--accent)' : 'transparent',
                color: isGitGraph ? 'var(--bg-primary)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isGitGraph) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isGitGraph) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
              title={isGitGraph ? 'Close git graph (Ctrl+G)' : 'Show git graph (Ctrl+G)'}
            >
              <GitBranch size={16} />
            </button>
          )}
          {onWorkingTreeToggle && (
            <button
              onClick={onWorkingTreeToggle}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{
                backgroundColor: isWorkingTree ? 'var(--accent)' : 'transparent',
                color: isWorkingTree ? 'var(--bg-primary)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isWorkingTree) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isWorkingTree) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
              title={isWorkingTree ? 'Close working tree (Ctrl+Shift+G)' : 'Show working tree (Ctrl+Shift+G)'}
            >
              <GitPullRequestDraft size={16} />
            </button>
          )}
          {onBeadsBoardToggle && (
            <button
              onClick={onBeadsBoardToggle}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{
                backgroundColor: isBeadsBoard ? 'var(--accent)' : 'transparent',
                color: isBeadsBoard ? 'var(--bg-primary)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isBeadsBoard) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isBeadsBoard) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
              title={isBeadsBoard ? 'Close beads board (Ctrl+Shift+B)' : 'Show beads board (Ctrl+Shift+B)'}
            >
              <LayoutGrid size={16} />
            </button>
          )}
          {onHotkeysClick && (
            <button
              onClick={onHotkeysClick}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{
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
              title="Keyboard shortcuts (?)"
            >
              <Keyboard size={16} />
            </button>
          )}

          {/* Split View toggle - furthest right */}
          {onSplitToggle && (
            <button
              onClick={onSplitToggle}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{
                backgroundColor: isSplit ? 'var(--accent)' : 'transparent',
                color: isSplit ? 'var(--bg-primary)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isSplit) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSplit) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
              title={isSplit ? 'Close split view (Ctrl+\\)' : 'Open split view (Ctrl+\\)'}
            >
              <Columns size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M18 6L6 18M6 6l12 12" />
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

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.type === 'diff') {
    return (
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        <FileDiff size={14} style={{ color: 'var(--accent)' }} />
      </span>
    );
  }
  if (tab.type === 'conversation') {
    return (
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        <Users size={14} style={{ color: '#22c55e' }} />
      </span>
    );
  }
  if (tab.type === 'git-graph') {
    return (
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        <GitBranch size={14} style={{ color: 'var(--accent)' }} />
      </span>
    );
  }
  if (tab.type === 'working-tree') {
    return (
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        <GitPullRequestDraft size={14} style={{ color: 'var(--accent)' }} />
      </span>
    );
  }
  if (tab.type === 'beads-board') {
    return (
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        <LayoutGrid size={14} style={{ color: 'var(--accent)' }} />
      </span>
    );
  }
  return <FileIcon path={tab.path} />;
}
