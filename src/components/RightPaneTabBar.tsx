import { useState } from 'react';
import type { RightPaneTab } from '../context/PageStateContext';
import { getFileIconInfo } from '../utils/fileIcons';

interface RightPaneTabBarProps {
  tabs: RightPaneTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabPin: (id: string) => void;
  onTabUnpin?: (id: string) => void;
  onTabContextMenu?: (e: React.MouseEvent, tab: RightPaneTab) => void;
  onReorderTab?: (fromId: string, toId: string) => void;
}

interface TabItemProps {
  tab: RightPaneTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onPin: () => void;
  onUnpin?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onReorder?: (fromId: string, toId: string) => void;
}

function TabItem({ tab, isActive, onSelect, onClose, onPin, onUnpin, onContextMenu, onReorder }: TabItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null);

  const displayName = tab.path.split('/').pop() ?? tab.path.split('\\').pop() ?? tab.path;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-tab-id', tab.id);
    e.dataTransfer.setData('application/x-tab-pane', 'right');
    e.dataTransfer.setData('text/plain', `right:${tab.path}`);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-tab-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    setDropSide(e.clientX < midX ? 'left' : 'right');
  };

  const handleDragLeave = () => {
    setDropSide(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    setDropSide(null);
    const fromId = e.dataTransfer.getData('application/x-tab-id');
    const fromPane = e.dataTransfer.getData('application/x-tab-pane');
    if (!fromId || fromPane !== 'right' || fromId === tab.id) return;
    e.preventDefault();
    e.stopPropagation();
    onReorder?.(fromId, tab.id);
  };

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

  // Show close button: always for pinned tabs, on hover for preview tabs
  const showCloseButton = tab.isPinned || isHovered;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="group flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer select-none min-w-0 max-w-[180px] transition-colors"
      style={{
        backgroundColor: isActive
          ? 'var(--bg-primary)'
          : isHovered
            ? 'color-mix(in srgb, var(--bg-primary) 50%, var(--bg-secondary))'
            : 'transparent',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        opacity: isDragging ? 0.5 : 1,
        boxShadow: dropSide === 'left'
          ? 'inset 2px 0 0 var(--accent)'
          : dropSide === 'right'
            ? 'inset -2px 0 0 var(--accent)'
            : 'none',
      }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={tab.path}
    >
      <FileIcon path={tab.path} />
      <span
        className="truncate"
        style={{
          fontStyle: tab.isPreview ? 'italic' : 'normal',
        }}
      >
        {displayName}
      </span>
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

export function RightPaneTabBar({ tabs, activeTabId, onTabSelect, onTabClose, onTabPin, onTabUnpin, onTabContextMenu, onReorderTab }: RightPaneTabBarProps) {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      className="flex items-end overflow-x-auto flex-1 min-w-0"
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => onTabSelect(tab.id)}
          onClose={() => onTabClose(tab.id)}
          onPin={() => onTabPin(tab.id)}
          onUnpin={onTabUnpin ? () => onTabUnpin(tab.id) : undefined}
          onContextMenu={onTabContextMenu ? (e) => onTabContextMenu(e, tab) : undefined}
          onReorder={onReorderTab}
        />
      ))}
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
