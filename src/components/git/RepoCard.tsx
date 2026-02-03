import { useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  ArrowUp,
  Download,
} from 'lucide-react';
import type { GitRepo } from '../../hooks/useGitRepos';
import { useGitOperations } from '../../hooks/useGitOperations';
import { StatusBadge } from './StatusBadge';
import { ChangesTree } from './ChangesTree';

interface RepoCardProps {
  repo: GitRepo;
  projectsDir: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRefresh: () => void;
  isFocused?: boolean;
}

export function RepoCard({
  repo,
  projectsDir,
  isExpanded,
  onToggleExpand,
  onRefresh,
  isFocused = false,
}: RepoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasChanges =
    repo.staged.length > 0 || repo.unstaged.length > 0 || repo.untracked.length > 0;

  // Scroll into view when expanded
  useEffect(() => {
    if (isExpanded && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isExpanded]);

  // Scroll into view when focused via keyboard
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused]);

  const { loading, error, stageFiles, unstageFiles, push, pull, fetch, discardFiles, discardAll, clearError } =
    useGitOperations(repo.name, projectsDir);

  // Handlers that refresh after operation
  const handleStage = async (files: string[]) => {
    await stageFiles(files);
    onRefresh();
  };

  const handleUnstage = async (files: string[]) => {
    await unstageFiles(files);
    onRefresh();
  };

  const handlePush = async () => {
    await push();
    onRefresh();
  };

  const handlePull = async () => {
    await pull();
    onRefresh();
  };

  const handleFetch = async () => {
    await fetch();
    onRefresh();
  };

  const handleDiscard = async (files: string[]) => {
    await discardFiles(files);
    onRefresh();
  };

  const handleDiscardAll = async () => {
    await discardAll();
    onRefresh();
  };

  return (
    <div
      ref={cardRef}
      className="rounded-lg overflow-hidden transition-all"
      style={{
        border: '1px solid var(--border)',
        borderLeft: hasChanges ? '2px solid #fbbf24' : '1px solid var(--border)',
        boxShadow: isFocused ? '0 0 0 2px var(--accent)' : 'none',
      }}
    >
      {/* Header - always visible */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
        onClick={onToggleExpand}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-secondary) 80%, var(--bg-primary))')
        }
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
      >
        {/* Expand chevron */}
        <button className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }}>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Repo name */}
        <span className="font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
          {repo.name}
        </span>

        {/* Branch */}
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <GitBranch className="w-3 h-3" />
          {repo.branch}
        </span>

        {/* Status badge */}
        <div className="ml-auto">
          <StatusBadge
            staged={repo.staged.length}
            unstaged={repo.unstaged.length}
            untracked={repo.untracked.length}
            ahead={repo.ahead}
            behind={repo.behind}
          />
        </div>

        {/* Quick GitHub link */}
        {repo.githubUrl && (
          <a
            href={repo.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded"
            style={{ color: 'var(--text-secondary)' }}
            title="Open on GitHub"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div
          className="p-4 space-y-4"
          style={{
            borderTop: '1px solid var(--border)',
            backgroundColor: 'color-mix(in srgb, var(--bg-primary) 50%, var(--bg-secondary))',
          }}
        >
          {/* Error display */}
          {error && (
            <div
              className="flex items-center gap-2 p-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, #f87171 10%, transparent)',
                border: '1px solid color-mix(in srgb, #f87171 30%, transparent)',
                color: '#f87171',
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="text-xs hover:underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleFetch}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50 transition-colors"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              title="Fetch from remote"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading === 'fetch' ? 'animate-spin' : ''}`} />
              Fetch
            </button>

            <button
              onClick={handlePull}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50 transition-colors"
              style={{
                backgroundColor: repo.behind > 0 ? 'color-mix(in srgb, #fb923c 20%, var(--bg-secondary))' : 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: repo.behind > 0 ? '#fb923c' : 'var(--text-primary)',
              }}
              title={repo.behind > 0 ? `Pull ${repo.behind} commits` : 'Pull from remote'}
            >
              <Download className={`w-3.5 h-3.5 ${loading === 'pull' ? 'animate-spin' : ''}`} />
              Pull {repo.behind > 0 && <span>({repo.behind})</span>}
            </button>

            <button
              onClick={handlePush}
              disabled={!!loading || repo.ahead === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50 transition-colors"
              style={{
                backgroundColor: repo.ahead > 0 ? 'color-mix(in srgb, #60a5fa 20%, var(--bg-secondary))' : 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: repo.ahead > 0 ? '#60a5fa' : 'var(--text-primary)',
              }}
              title={repo.ahead > 0 ? `Push ${repo.ahead} commits` : 'Nothing to push'}
            >
              <ArrowUp className={`w-3.5 h-3.5 ${loading === 'push' ? 'animate-spin' : ''}`} />
              Push {repo.ahead > 0 && <span>({repo.ahead})</span>}
            </button>

            {repo.githubUrl && (
              <a
                href={repo.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ml-auto"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                GitHub
              </a>
            )}
          </div>

          {/* File changes tree */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <ChangesTree
              staged={repo.staged}
              unstaged={repo.unstaged}
              untracked={repo.untracked}
              onStage={handleStage}
              onUnstage={handleUnstage}
              onDiscard={handleDiscard}
              onDiscardAll={handleDiscardAll}
              loading={loading}
            />
          </div>

          {/* Path info */}
          <div
            className="text-xs space-y-1"
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: '0.75rem',
              color: 'var(--text-secondary)',
            }}
          >
            <p>Path: {repo.path}</p>
            {repo.lastActivity && <p>Last activity: {new Date(repo.lastActivity).toLocaleDateString()}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
