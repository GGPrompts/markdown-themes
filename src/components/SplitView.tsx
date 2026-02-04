import { useRef, useCallback, useState, type ReactNode } from 'react';
import type { RightPaneContent } from '../hooks/useSplitView';

interface SplitViewProps {
  isSplit: boolean;
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  leftPane: ReactNode;
  rightPane: ReactNode;
  onDropToRight?: (path: string) => void;
  rightPaneContent?: RightPaneContent | null;
  onCloseRight?: () => void;
  rightIsStreaming?: boolean;
}

export function SplitView({
  isSplit,
  splitRatio,
  onSplitRatioChange,
  leftPane,
  rightPane,
  onDropToRight,
  rightPaneContent,
  onCloseRight,
  rightIsStreaming,
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newRatio = (moveEvent.clientX - containerRect.left) / containerRect.width;
      onSplitRatioChange(newRatio);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onSplitRatioChange]);

  // Single pane mode - render only left pane
  if (!isSplit) {
    return <div className="flex-1 flex flex-col overflow-hidden">{leftPane}</div>;
  }

  // Split mode - render both panes with draggable divider
  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden">
      {/* Left pane */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: `${splitRatio * 100}%` }}
      >
        {leftPane}
      </div>

      {/* Draggable divider */}
      <div
        className="w-1 flex-shrink-0 relative group"
        style={{
          backgroundColor: 'var(--border)',
          cursor: 'col-resize',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Visual indicator on hover */}
        <div
          className="absolute inset-y-0 -left-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'var(--accent)', opacity: 0 }}
        />
        <div
          className="absolute inset-y-0 left-0 right-0 group-hover:bg-[var(--accent)] transition-colors"
        />
      </div>

      {/* Right pane */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: `${(1 - splitRatio) * 100}%`,
          outline: isDragOver ? '2px dashed var(--accent)' : 'none',
          outlineOffset: '-2px',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          // Only set false if we're leaving the container entirely
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const path = e.dataTransfer.getData('text/plain');
          if (path && onDropToRight) {
            onDropToRight(path);
          }
          setIsDragOver(false);
        }}
      >
        {/* Right pane header */}
        <RightPaneHeader
          rightPaneContent={rightPaneContent}
          rightIsStreaming={rightIsStreaming}
          onClose={onCloseRight}
        />
        {rightPane}
      </div>
    </div>
  );
}

function getHeaderTitle(content: RightPaneContent | null | undefined): { title: string; subtitle?: string } {
  if (!content) {
    return { title: 'Drag a tab here' };
  }

  switch (content.type) {
    case 'file': {
      const fileName = content.path.split('/').pop() ?? content.path.split('\\').pop() ?? content.path;
      return { title: fileName, subtitle: content.path };
    }
    case 'git-graph':
      return { title: 'Git Graph' };
    case 'diff': {
      const base = content.base.substring(0, 8);
      const head = content.head ? content.head.substring(0, 8) : 'working tree';
      return { title: `${base}...${head}`, subtitle: content.file };
    }
    case 'commit': {
      const hash = content.hash.substring(0, 8);
      return { title: `Commit ${hash}` };
    }
  }
}

function RightPaneHeader({
  rightPaneContent,
  rightIsStreaming,
  onClose,
}: {
  rightPaneContent?: RightPaneContent | null;
  rightIsStreaming?: boolean;
  onClose?: () => void;
}) {
  const { title, subtitle } = getHeaderTitle(rightPaneContent);
  const hasContent = !!rightPaneContent;
  const showStreaming = rightIsStreaming && rightPaneContent?.type === 'file';

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
        minHeight: '36px',
      }}
    >
      {hasContent ? (
        <>
          <span
            className="flex-1 text-sm truncate"
            style={{ color: 'var(--text-primary)' }}
            title={subtitle ?? title}
          >
            {title}
          </span>
          {showStreaming && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              <span className="relative flex h-2 w-2">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                <span
                  className="relative inline-flex rounded-full h-2 w-2"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              </span>
              AI writing...
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              title="Close"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </>
      ) : (
        <span
          className="flex-1 text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          {title}
        </span>
      )}
    </div>
  );
}
