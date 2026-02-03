import { CheckCircle2, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';

interface StatusBadgeProps {
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
  className?: string;
}

export function StatusBadge({
  staged,
  unstaged,
  untracked,
  ahead,
  behind,
  className = '',
}: StatusBadgeProps) {
  const isDirty = staged > 0 || unstaged > 0 || untracked > 0;
  const hasRemoteChanges = ahead > 0 || behind > 0;

  // Clean repo
  if (!isDirty && !hasRemoteChanges) {
    return (
      <span
        className={`flex items-center gap-1 text-xs ${className}`}
        style={{ color: '#34d399' }}
      >
        <CheckCircle2 className="w-3 h-3" />
        Clean
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      {/* Dirty indicator */}
      {isDirty && (
        <span className="flex items-center gap-1" style={{ color: '#fbbf24' }}>
          <AlertCircle className="w-3 h-3" />
          {staged + unstaged + untracked} changes
        </span>
      )}

      {/* Ahead/behind */}
      {ahead > 0 && (
        <span className="flex items-center gap-0.5" style={{ color: '#60a5fa' }}>
          <ArrowUp className="w-3 h-3" />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="flex items-center gap-0.5" style={{ color: '#fb923c' }}>
          <ArrowDown className="w-3 h-3" />
          {behind}
        </span>
      )}
    </div>
  );
}
