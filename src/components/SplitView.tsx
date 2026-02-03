import { useRef, useCallback, type ReactNode } from 'react';

interface SplitViewProps {
  isSplit: boolean;
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  leftPane: ReactNode;
  rightPane: ReactNode;
}

export function SplitView({
  isSplit,
  splitRatio,
  onSplitRatioChange,
  leftPane,
  rightPane,
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

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
        style={{ width: `${(1 - splitRatio) * 100}%` }}
      >
        {rightPane}
      </div>
    </div>
  );
}
