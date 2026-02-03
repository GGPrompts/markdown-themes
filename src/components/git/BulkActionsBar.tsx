import { Download, Upload, RefreshCw, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { BulkOperationProgress, BulkOperationType } from '../../hooks/useBulkGitOperations';

interface BulkActionsBarProps {
  repoCount: number;
  selectedCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onFetchSelected: () => void;
  onPullSelected: () => void;
  onPushSelected: () => void;
  progress: BulkOperationProgress | null;
  isRunning: boolean;
}

const operationLabels: Record<BulkOperationType, string> = {
  fetch: 'Fetching',
  pull: 'Pulling',
  push: 'Pushing',
};

export function BulkActionsBar({
  repoCount,
  selectedCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onFetchSelected,
  onPullSelected,
  onPushSelected,
  progress,
  isRunning,
}: BulkActionsBarProps) {
  const successCount = progress?.results.filter((r) => r.success).length ?? 0;
  const failedCount = progress?.results.filter((r) => !r.success).length ?? 0;
  const failedRepos = progress?.results.filter((r) => !r.success) ?? [];

  const hasSelection = selectedCount > 0;

  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{
        borderBottom: '1px solid var(--border)',
        backgroundColor: hasSelection
          ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
          : 'color-mix(in srgb, var(--accent) 5%, transparent)',
      }}
    >
      {/* Actions row */}
      <div className="flex items-center gap-4">
        {/* Select All checkbox */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected && repoCount > 0}
            onChange={() => (allSelected ? onDeselectAll() : onSelectAll())}
            className="w-4 h-4 rounded cursor-pointer"
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Select All
          </span>
        </label>

        {/* Selected count */}
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {selectedCount} of {repoCount} selected
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onFetchSelected}
            disabled={isRunning || !hasSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            title={hasSelection ? `Fetch ${selectedCount} selected repos` : 'Select repos to fetch'}
          >
            <RefreshCw
              className={`w-4 h-4 ${isRunning && progress?.operation === 'fetch' ? 'animate-spin' : ''}`}
            />
            Fetch
          </button>

          <button
            onClick={onPullSelected}
            disabled={isRunning || !hasSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            title={hasSelection ? `Pull ${selectedCount} selected repos` : 'Select repos to pull'}
          >
            <Download
              className={`w-4 h-4 ${isRunning && progress?.operation === 'pull' ? 'animate-bounce' : ''}`}
            />
            Pull
          </button>

          <button
            onClick={onPushSelected}
            disabled={isRunning || !hasSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            title={hasSelection ? `Push ${selectedCount} selected repos` : 'Select repos to push'}
          >
            <Upload
              className={`w-4 h-4 ${isRunning && progress?.operation === 'push' ? 'animate-bounce' : ''}`}
            />
            Push
          </button>

          {/* Clear selection button */}
          {hasSelection && (
            <button
              onClick={onDeselectAll}
              disabled={isRunning}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ color: 'var(--text-secondary)' }}
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress row */}
      {progress && (
        <div className="flex flex-col gap-2">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
            ) : failedCount > 0 ? (
              <AlertCircle className="w-4 h-4" style={{ color: '#f87171' }} />
            ) : (
              <CheckCircle className="w-4 h-4" style={{ color: '#34d399' }} />
            )}
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isRunning
                ? `${operationLabels[progress.operation]} ${progress.completed}/${progress.total} repos...`
                : `${operationLabels[progress.operation]} complete: ${successCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''}`}
            </span>
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                  backgroundColor:
                    failedCount > 0 && !isRunning ? '#eab308' : 'var(--accent)',
                }}
              />
            </div>
          </div>

          {/* Failed repos list */}
          {failedRepos.length > 0 && !isRunning && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span style={{ color: '#f87171' }}>Failed:</span>
              {failedRepos.map((r) => (
                <span
                  key={r.repoName}
                  className="px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: 'color-mix(in srgb, #f87171 10%, transparent)',
                    color: '#f87171',
                  }}
                  title={r.error}
                >
                  {r.repoName}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
