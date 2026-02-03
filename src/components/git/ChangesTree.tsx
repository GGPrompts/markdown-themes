import { useState } from 'react';
import {
  File,
  FilePlus,
  FileMinus,
  FileEdit,
  FileQuestion,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Undo2,
} from 'lucide-react';
import type { GitFile } from '../../hooks/useGitRepos';

interface ChangesTreeProps {
  staged: GitFile[];
  unstaged: GitFile[];
  untracked: GitFile[];
  onStage?: (files: string[]) => void;
  onUnstage?: (files: string[]) => void;
  onDiscard?: (files: string[]) => void;
  onDiscardAll?: () => void;
  loading?: string | null;
}

function FileIcon({ status }: { status: string }) {
  switch (status) {
    case 'A':
      return <FilePlus className="w-4 h-4" style={{ color: '#34d399' }} />;
    case 'D':
      return <FileMinus className="w-4 h-4" style={{ color: '#f87171' }} />;
    case 'M':
      return <FileEdit className="w-4 h-4" style={{ color: '#fbbf24' }} />;
    case '?':
      return <FileQuestion className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />;
    default:
      return <File className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />;
  }
}

interface FileListProps {
  files: GitFile[];
  title: string;
  titleColor: string;
  actionIcon?: typeof Plus;
  actionLabel?: string;
  onAction?: (files: string[]) => void;
  onDiscard?: (files: string[]) => void;
  onDiscardAll?: () => void;
  showDiscard?: boolean;
  loading?: boolean;
  discardLoading?: boolean;
}

function FileList({
  files,
  title,
  titleColor,
  actionIcon: ActionIcon,
  actionLabel,
  onAction,
  onDiscard,
  onDiscardAll,
  showDiscard,
  loading,
  discardLoading,
}: FileListProps) {
  const [expanded, setExpanded] = useState(true);

  if (files.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium mb-2 px-2 py-1.5 rounded w-full text-left group"
        style={{
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        )}
        <span style={{ color: titleColor }}>{title}</span>
        <span style={{ color: 'var(--text-secondary)' }}>({files.length})</span>

        <div className="ml-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Discard all button */}
          {showDiscard && onDiscardAll && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDiscardAll();
              }}
              disabled={discardLoading}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs disabled:opacity-50 transition-colors"
              style={{
                color: '#f87171',
                backgroundColor: 'color-mix(in srgb, #f87171 10%, transparent)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #f87171 20%, transparent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #f87171 10%, transparent)';
              }}
              title="Discard all changes"
            >
              <Undo2 className="w-3 h-3" />
              <span>Discard</span>
            </button>
          )}

          {/* Stage/Unstage all button */}
          {onAction && ActionIcon && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAction(files.map((f) => f.path));
              }}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs disabled:opacity-50 transition-colors"
              style={{
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-secondary) 80%, var(--bg-primary))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
              title={actionLabel}
            >
              <ActionIcon className="w-3 h-3" />
              <span>{actionLabel}</span>
            </button>
          )}
        </div>
      </button>

      {expanded && (
        <div className="ml-2 space-y-1">
          {files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-2 text-sm py-2 px-3 rounded-lg group"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-secondary) 50%, transparent)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <FileIcon status={file.status} />
              <span
                className="font-mono truncate text-sm"
                style={{ color: 'var(--text-primary)', maxWidth: '400px' }}
              >
                {file.path}
              </span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                {/* Individual discard */}
                {showDiscard && onDiscard && (
                  <button
                    onClick={() => onDiscard([file.path])}
                    disabled={discardLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs disabled:opacity-50 transition-colors"
                    style={{
                      color: '#f87171',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #f87171 15%, transparent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="Discard changes"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Discard</span>
                  </button>
                )}

                {/* Individual stage/unstage */}
                {onAction && ActionIcon && (
                  <button
                    onClick={() => onAction([file.path])}
                    disabled={loading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs disabled:opacity-50 transition-colors"
                    style={{
                      color: 'var(--text-secondary)',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title={actionLabel}
                  >
                    <ActionIcon className="w-3.5 h-3.5" />
                    <span>{actionLabel}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChangesTree({
  staged,
  unstaged,
  untracked,
  onStage,
  onUnstage,
  onDiscard,
  onDiscardAll,
  loading,
}: ChangesTreeProps) {
  const totalChanges = staged.length + unstaged.length + untracked.length;

  if (totalChanges === 0) {
    return (
      <div className="text-xs py-2" style={{ color: 'var(--text-secondary)' }}>
        No changes
      </div>
    );
  }

  return (
    <div className="text-sm">
      <FileList
        files={staged}
        title="Staged Changes"
        titleColor="#34d399"
        actionIcon={Minus}
        actionLabel="Unstage"
        onAction={onUnstage}
        loading={loading === 'unstage'}
      />
      <FileList
        files={unstaged}
        title="Changes"
        titleColor="#fbbf24"
        actionIcon={Plus}
        actionLabel="Stage"
        onAction={onStage}
        onDiscard={onDiscard}
        onDiscardAll={onDiscardAll}
        showDiscard={true}
        loading={loading === 'stage'}
        discardLoading={loading === 'discard'}
      />
      <FileList
        files={untracked}
        title="Untracked"
        titleColor="var(--text-secondary)"
        actionIcon={Plus}
        actionLabel="Stage"
        onAction={onStage}
        loading={loading === 'stage'}
      />
    </div>
  );
}
