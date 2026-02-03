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
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium mb-1 px-1 py-0.5 rounded w-full text-left group"
        style={{
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
        )}
        <span style={{ color: titleColor }}>{title}</span>
        <span style={{ color: 'var(--text-secondary)' }}>({files.length})</span>

        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Discard all button */}
          {showDiscard && onDiscardAll && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDiscardAll();
              }}
              disabled={discardLoading}
              className="p-1 rounded disabled:opacity-50"
              style={{ color: '#f87171' }}
              title="Discard all changes"
            >
              <Undo2 className="w-3 h-3" />
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
              className="p-1 rounded disabled:opacity-50"
              style={{ color: 'var(--text-secondary)' }}
              title={actionLabel}
            >
              <ActionIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </button>

      {expanded && (
        <div className="ml-4 space-y-0.5">
          {files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-2 text-xs py-0.5 px-1 rounded group"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-secondary) 50%, transparent)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <FileIcon status={file.status} />
              <span
                className="font-mono truncate flex-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {file.path}
              </span>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Individual discard */}
                {showDiscard && onDiscard && (
                  <button
                    onClick={() => onDiscard([file.path])}
                    disabled={discardLoading}
                    className="p-0.5 rounded disabled:opacity-50"
                    style={{ color: '#f87171' }}
                    title="Discard changes"
                  >
                    <Undo2 className="w-3 h-3" />
                  </button>
                )}

                {/* Individual stage/unstage */}
                {onAction && ActionIcon && (
                  <button
                    onClick={() => onAction([file.path])}
                    disabled={loading}
                    className="p-0.5 rounded disabled:opacity-50"
                    style={{ color: 'var(--text-secondary)' }}
                    title={actionLabel}
                  >
                    <ActionIcon className="w-3 h-3" />
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
