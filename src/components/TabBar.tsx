import { useState } from 'react';
import { FileDiff } from 'lucide-react';
import type { Tab } from '../hooks/useTabManager';
import { getFileIconInfo } from '../utils/fileIcons';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabPin: (id: string) => void;
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onPin: () => void;
}

function TabItem({ tab, isActive, onSelect, onClose, onPin }: TabItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // For diff tabs, show "filename @ abc123", for files show just filename
  const displayName = tab.type === 'diff' && tab.diffData
    ? `${tab.diffData.file.split('/').pop()} @ ${tab.diffData.base.substring(0, 7)}`
    : (tab.path.split('/').pop() ?? tab.path.split('\\').pop() ?? tab.path);

  const tooltipText = tab.type === 'diff' && tab.diffData
    ? `Diff: ${tab.diffData.file} (${tab.diffData.base.substring(0, 7)})`
    : tab.path;

  const handleDoubleClick = () => {
    if (tab.isPreview) {
      onPin();
    }
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleDragStart = (e: React.DragEvent) => {
    // Only allow dragging file tabs, not diff tabs
    if (tab.type === 'diff') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', tab.path);
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
      }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
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

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose, onTabPin }: TabBarProps) {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      className="flex items-end overflow-x-auto"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        minHeight: '36px',
      }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => onTabSelect(tab.id)}
          onClose={() => onTabClose(tab.id)}
          onPin={() => onTabPin(tab.id)}
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

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.type === 'diff') {
    return (
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        <FileDiff size={14} style={{ color: 'var(--accent)' }} />
      </span>
    );
  }
  return <FileIcon path={tab.path} />;
}
