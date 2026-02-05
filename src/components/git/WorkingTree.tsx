import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GitBranch,
  RefreshCw,
  AlertCircle,
  ArrowUp,
  Download,
  ExternalLink,
  FolderGit2,
} from 'lucide-react';
import { useGitOperations } from '../../hooks/useGitOperations';
import { appendToFile } from '../../lib/api';
import { StatusBadge } from './StatusBadge';
import { ChangesTree } from './ChangesTree';
import { CommitForm } from './CommitForm';
import type { GitRepo, GitFile } from '../../hooks/useGitRepos';

const API_BASE = 'http://localhost:8129';

interface WorkingTreeProps {
  repoPath: string;
  onFileSelect?: (path: string) => void;
  /** Called after a successful commit with the list of files that are no longer changed */
  onCommitSuccess?: (committedFiles: string[]) => void;
}

/**
 * Fetch git status for a single repository
 */
function useGitStatus(repoPath: string) {
  const [repo, setRepo] = useState<GitRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedError, setDebouncedError] = useState<string | null>(null);

  // Debounce error display to avoid flashing transient errors
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setDebouncedError(error), 300);
      return () => clearTimeout(timer);
    } else {
      setDebouncedError(null);
    }
  }, [error]);

  const fetchStatus = useCallback(async () => {
    if (!repoPath) return;

    setLoading(true);
    setError(null);

    try {
      // Get parent directory and repo name
      const parentDir = repoPath.substring(0, repoPath.lastIndexOf('/')) || repoPath;
      const repoName = repoPath.split('/').pop() || '';

      const url = `${API_BASE}/api/git/repos?dir=${encodeURIComponent(parentDir)}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.success) {
        // Find our specific repo
        const foundRepo = json.data.repos.find(
          (r: GitRepo) => r.name === repoName || r.path === repoPath
        );
        if (foundRepo) {
          setRepo(foundRepo);
        } else {
          setError('Not a git repository');
        }
      } else {
        setError(json.error || 'Failed to fetch status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { repo, loading, error: debouncedError, refetch: fetchStatus };
}

export function WorkingTree({ repoPath, onFileSelect, onCommitSuccess }: WorkingTreeProps) {
  const { repo, loading, error, refetch } = useGitStatus(repoPath);

  // Derive parent directory for git operations
  const projectsDir = useMemo(
    () => repoPath.substring(0, repoPath.lastIndexOf('/')) || repoPath,
    [repoPath]
  );

  const repoName = repo?.name || repoPath.split('/').pop() || '';

  const {
    loading: opLoading,
    error: opError,
    stageFiles,
    unstageFiles,
    commit,
    push,
    pull,
    fetch: gitFetch,
    discardFiles,
    discardAll,
    generateMessage,
    clearError,
  } = useGitOperations(repoName, projectsDir);

  const hasChanges = repo
    ? repo.staged.length > 0 || repo.unstaged.length > 0 || repo.untracked.length > 0
    : false;

  // Operation handlers that refresh after completion
  const handleStage = async (files: string[]) => {
    await stageFiles(files);
    refetch();
  };

  const handleUnstage = async (files: string[]) => {
    await unstageFiles(files);
    refetch();
  };

  const handlePush = async () => {
    await push();
    refetch();
  };

  const handlePull = async () => {
    await pull();
    refetch();
  };

  const handleFetch = async () => {
    await gitFetch();
    refetch();
  };

  const handleDiscard = async (files: string[]) => {
    await discardFiles(files);
    refetch();
  };

  const handleDiscardAll = async () => {
    await discardAll();
    refetch();
  };

  const handleCommit = async (message: string) => {
    // Capture staged files before commit to report what was committed
    const stagedPaths = repo?.staged.map((f) => `${repoPath}/${f.path}`) || [];
    await commit(message);
    refetch();

    // Notify parent about committed files
    if (onCommitSuccess && stagedPaths.length > 0) {
      onCommitSuccess(stagedPaths);
    }
  };

  const handleStageAll = async () => {
    await stageFiles(['.']);
    refetch();
  };

  const handleGenerateMessage = async (): Promise<string> => {
    return await generateMessage();
  };

  const handleIgnore = async (file: string) => {
    const gitignorePath = `${repoPath}/.gitignore`;
    try {
      await appendToFile(gitignorePath, file);
      refetch();
    } catch (err) {
      console.error('Failed to add to .gitignore:', err);
    }
  };

  // Handle file click - emit full path
  const handleFileClick = useCallback(
    (file: GitFile) => {
      if (onFileSelect) {
        onFileSelect(`${repoPath}/${file.path}`);
      }
    },
    [repoPath, onFileSelect]
  );

  // Loading state
  if (loading && !repo) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-8 h-8 mb-2" style={{ color: '#f87171' }} />
        <p className="text-sm text-center" style={{ color: '#f87171' }}>
          {error}
        </p>
        <button
          onClick={refetch}
          className="mt-3 px-4 py-2 text-sm rounded-lg transition-colors"
          style={{
            backgroundColor: 'color-mix(in srgb, #f87171 20%, transparent)',
            color: '#f87171',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // No repo found
  if (!repo) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <FolderGit2 className="w-12 h-12 mb-4 opacity-50" style={{ color: 'var(--text-secondary)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Not a git repository
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Branch info */}
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <span
            className="font-mono text-sm truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {repo.branch}
          </span>
        </div>

        {/* Status badge */}
        <StatusBadge
          staged={repo.staged.length}
          unstaged={repo.unstaged.length}
          untracked={repo.untracked.length}
          ahead={repo.ahead}
          behind={repo.behind}
        />

        {/* Refresh button */}
        <button
          onClick={refetch}
          disabled={loading}
          className="p-1.5 rounded transition-colors ml-auto"
          style={{ color: 'var(--text-secondary)' }}
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* GitHub link */}
        {repo.githubUrl && (
          <a
            href={repo.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            title="Open on GitHub"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Operation error */}
        {opError && (
          <div
            className="flex items-center gap-2 p-2 rounded-lg text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, #f87171 10%, transparent)',
              border: '1px solid color-mix(in srgb, #f87171 30%, transparent)',
              color: '#f87171',
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{opError}</span>
            <button onClick={clearError} className="text-xs hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleFetch}
            disabled={!!opLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50 transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            title="Fetch from remote"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${opLoading === 'fetch' ? 'animate-spin' : ''}`} />
            Fetch
          </button>

          <button
            onClick={handlePull}
            disabled={!!opLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50 transition-colors"
            style={{
              backgroundColor:
                repo.behind > 0
                  ? 'color-mix(in srgb, #fb923c 20%, var(--bg-secondary))'
                  : 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: repo.behind > 0 ? '#fb923c' : 'var(--text-primary)',
            }}
            title={repo.behind > 0 ? `Pull ${repo.behind} commits` : 'Pull from remote'}
          >
            <Download className={`w-3.5 h-3.5 ${opLoading === 'pull' ? 'animate-spin' : ''}`} />
            Pull {repo.behind > 0 && <span>({repo.behind})</span>}
          </button>

          <button
            onClick={handlePush}
            disabled={!!opLoading || repo.ahead === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md disabled:opacity-50 transition-colors"
            style={{
              backgroundColor:
                repo.ahead > 0
                  ? 'color-mix(in srgb, #60a5fa 20%, var(--bg-secondary))'
                  : 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: repo.ahead > 0 ? '#60a5fa' : 'var(--text-primary)',
            }}
            title={repo.ahead > 0 ? `Push ${repo.ahead} commits` : 'Nothing to push'}
          >
            <ArrowUp className={`w-3.5 h-3.5 ${opLoading === 'push' ? 'animate-spin' : ''}`} />
            Push {repo.ahead > 0 && <span>({repo.ahead})</span>}
          </button>
        </div>

        {/* File changes */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <ChangesTree
            staged={repo.staged}
            unstaged={repo.unstaged}
            untracked={repo.untracked}
            onStage={handleStage}
            onUnstage={handleUnstage}
            onDiscard={handleDiscard}
            onDiscardAll={handleDiscardAll}
            onIgnore={handleIgnore}
            onFileClick={handleFileClick}
            loading={opLoading}
          />
        </div>

        {/* Commit form */}
        {hasChanges && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <CommitForm
              onCommit={handleCommit}
              onStageAll={handleStageAll}
              onGenerateMessage={handleGenerateMessage}
              hasUnstaged={repo.unstaged.length > 0 || repo.untracked.length > 0}
              hasStaged={repo.staged.length > 0}
              loading={opLoading}
            />
          </div>
        )}

        {/* Clean state message */}
        {!hasChanges && (
          <div
            className="text-center py-8"
            style={{ color: 'var(--text-secondary)' }}
          >
            <p className="text-sm">Working tree clean</p>
          </div>
        )}
      </div>
    </div>
  );
}
