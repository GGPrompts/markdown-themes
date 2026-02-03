import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, RefreshCw, AlertCircle, Search, ArrowLeft } from 'lucide-react';
import { useGitRepos } from '../hooks/useGitRepos';
import { useBulkGitOperations } from '../hooks/useBulkGitOperations';
import { RepoCard, BulkActionsBar } from '../components/git';

// Default projects directory
const DEFAULT_PROJECTS_DIR = '/home/marci/projects';

// Loading skeleton component
function RepoSkeleton() {
  return (
    <div
      className="rounded-lg p-3 animate-pulse"
      style={{ border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-4 h-4 rounded"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        />
        <div
          className="w-32 h-4 rounded"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        />
        <div
          className="w-16 h-4 rounded ml-2"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        />
        <div
          className="w-20 h-4 rounded ml-auto"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        />
      </div>
    </div>
  );
}

export function SourceControl() {
  const [projectsDir] = useState(DEFAULT_PROJECTS_DIR);
  const { data, loading, error, refetch } = useGitRepos(projectsDir);

  // Bulk operations
  const { progress, isRunning, fetchAll, pullAll, pushAll, clearProgress } = useBulkGitOperations();

  // Search and filtering
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Track which cards are expanded
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());

  // Track focused repo index for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Track selected repos for bulk operations
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((repoName: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoName)) {
        next.delete(repoName);
      } else {
        next.add(repoName);
      }
      return next;
    });
  }, []);

  const toggleSelect = useCallback((repoName: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoName)) {
        next.delete(repoName);
      } else {
        next.add(repoName);
      }
      return next;
    });
  }, []);

  // Reset focused index when filtered repos change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery]);

  // Filter and sort repos
  const filteredRepos = useMemo(() => {
    if (!data?.repos) return [];

    let repos = [...data.repos];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      repos = repos.filter((r) => r.name.toLowerCase().includes(query));
    }

    // Sort by activity (most recent first), then by name
    repos.sort((a, b) => {
      // Dirty repos first
      const aChanges = a.staged.length + a.unstaged.length + a.untracked.length;
      const bChanges = b.staged.length + b.unstaged.length + b.untracked.length;
      if (aChanges > 0 && bChanges === 0) return -1;
      if (bChanges > 0 && aChanges === 0) return 1;

      // Then by name
      return a.name.localeCompare(b.name);
    });

    return repos;
  }, [data?.repos, searchQuery]);

  // Check if all visible repos are clean
  const allReposClean = useMemo(() => {
    return (
      filteredRepos.length > 0 &&
      filteredRepos.every(
        (r) => r.staged.length === 0 && r.unstaged.length === 0 && r.untracked.length === 0
      )
    );
  }, [filteredRepos]);

  // Selection callbacks (must be after filteredRepos is defined)
  const selectAllFiltered = useCallback(() => {
    setSelectedRepos(new Set(filteredRepos.map((r) => r.name)));
  }, [filteredRepos]);

  const clearSelection = useCallback(() => {
    setSelectedRepos(new Set());
    clearProgress();
  }, [clearProgress]);

  // Check if all filtered repos are selected
  const allSelected = useMemo(() => {
    return filteredRepos.length > 0 && filteredRepos.every((r) => selectedRepos.has(r.name));
  }, [filteredRepos, selectedRepos]);

  // Bulk operation handlers - now operate on selected repos only
  const handleFetchSelected = useCallback(() => {
    const repoNames = Array.from(selectedRepos);
    fetchAll(repoNames, () => {
      clearProgress();
      refetch();
    }, projectsDir);
  }, [selectedRepos, fetchAll, clearProgress, refetch, projectsDir]);

  const handlePullSelected = useCallback(() => {
    const repoNames = Array.from(selectedRepos);
    pullAll(repoNames, () => {
      clearProgress();
      refetch();
    }, projectsDir);
  }, [selectedRepos, pullAll, clearProgress, refetch, projectsDir]);

  const handlePushSelected = useCallback(() => {
    const repoNames = Array.from(selectedRepos);
    pushAll(repoNames, () => {
      clearProgress();
      refetch();
    }, projectsDir);
  }, [selectedRepos, pushAll, clearProgress, refetch, projectsDir]);

  // Auto-expand if only one repo is showing (on initial load)
  const hasAutoExpanded = useRef(false);
  useEffect(() => {
    if (!hasAutoExpanded.current && filteredRepos.length === 1 && !loading) {
      setExpandedRepos(new Set([filteredRepos[0].name]));
      hasAutoExpanded.current = true;
    }
  }, [filteredRepos, loading]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '/':
          // Focus search
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'j':
          // Move to next repo
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev + 1;
            return next >= filteredRepos.length ? 0 : next;
          });
          break;
        case 'k':
          // Move to previous repo
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? filteredRepos.length - 1 : next;
          });
          break;
        case 'Enter':
          // Toggle expand on focused repo
          if (focusedIndex >= 0 && focusedIndex < filteredRepos.length) {
            e.preventDefault();
            toggleExpand(filteredRepos[focusedIndex].name);
          }
          break;
        case 'Escape':
          // Clear search or collapse all
          e.preventDefault();
          if (searchQuery) {
            setSearchQuery('');
          } else {
            setExpandedRepos(new Set());
            setFocusedIndex(-1);
          }
          break;
        case 'r':
          // Refresh if not already loading
          if (!loading) {
            e.preventDefault();
            refetch();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, loading, refetch, filteredRepos, focusedIndex, toggleExpand]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-4 px-4 py-3"
        style={{
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <Link
          to="/"
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          title="Back to Home"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <h2
          className="text-lg font-semibold font-mono flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <GitBranch className="w-5 h-5" />
          Source Control
        </h2>

        <span className="text-sm font-mono ml-auto" style={{ color: 'var(--text-secondary)' }}>
          {data?.projectsDir || projectsDir}
        </span>

        <button
          onClick={refetch}
          disabled={loading}
          className="p-2 rounded-lg transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
          title="Refresh (r)"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search bar */}
      <div
        className="px-4 py-2 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-secondary)' }}
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search repositories... (press /)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {filteredRepos.length} / {data?.repos.length || 0} repos
        </span>
      </div>

      {/* Bulk actions bar */}
      {filteredRepos.length > 0 && (
        <BulkActionsBar
          repoCount={filteredRepos.length}
          selectedCount={selectedRepos.size}
          allSelected={allSelected}
          onSelectAll={selectAllFiltered}
          onDeselectAll={clearSelection}
          onFetchSelected={handleFetchSelected}
          onPullSelected={handlePullSelected}
          onPushSelected={handlePushSelected}
          progress={progress}
          isRunning={isRunning}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Loading state with skeletons */}
        {loading && !data && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <RepoSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            className="flex flex-col items-center justify-center h-32"
            style={{ color: '#f87171' }}
          >
            <AlertCircle className="w-6 h-6 mb-2" />
            <p className="text-center max-w-sm">{error}</p>
            <button
              onClick={refetch}
              className="mt-3 px-4 py-2 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: 'color-mix(in srgb, #f87171 20%, transparent)',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state: No repos found at all */}
        {!loading && !error && data?.repos.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-48"
            style={{ color: 'var(--text-secondary)' }}
          >
            <GitBranch className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No repositories found</p>
            <p className="text-sm text-center max-w-sm">
              No git repositories were found in {data?.projectsDir}. Create a new project or clone
              an existing one to get started.
            </p>
          </div>
        )}

        {/* Empty state: No search results */}
        {!loading &&
          !error &&
          filteredRepos.length === 0 &&
          searchQuery &&
          (data?.repos.length || 0) > 0 && (
            <div
              className="flex flex-col items-center justify-center h-48"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Search className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No matches found</p>
              <p className="text-sm">No repositories match "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                Clear Search
              </button>
            </div>
          )}

        {/* Success banner: All repos are clean */}
        {!loading && !error && allReposClean && (
          <div
            className="mb-4 p-3 rounded-lg text-center text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, #34d399 10%, transparent)',
              border: '1px solid color-mix(in srgb, #34d399 20%, transparent)',
              color: '#34d399',
            }}
          >
            All repositories are clean!
          </div>
        )}

        {/* Repo list */}
        {filteredRepos.length > 0 && (
          <div className="space-y-2">
            {filteredRepos.map((repo, index) => {
              // Use parent of repo.path as projectsDir for API calls
              const repoParentDir =
                repo.path.substring(0, repo.path.lastIndexOf('/')) || repo.path;
              return (
                <RepoCard
                  key={repo.path}
                  repo={repo}
                  projectsDir={repoParentDir}
                  isExpanded={expandedRepos.has(repo.name)}
                  onToggleExpand={() => toggleExpand(repo.name)}
                  onRefresh={refetch}
                  isFocused={focusedIndex === index}
                  isSelected={selectedRepos.has(repo.name)}
                  onToggleSelect={() => toggleSelect(repo.name)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Keyboard shortcuts help */}
      <div
        className="px-4 py-2 text-xs flex items-center gap-4"
        style={{
          borderTop: '1px solid var(--border)',
          backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 30%, transparent)',
          color: 'var(--text-secondary)',
        }}
      >
        <span>
          <kbd
            className="px-1.5 py-0.5 rounded font-mono text-[10px]"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            /
          </kbd>{' '}
          Search
        </span>
        <span>
          <kbd
            className="px-1.5 py-0.5 rounded font-mono text-[10px]"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            j
          </kbd>
          <kbd
            className="px-1.5 py-0.5 rounded font-mono text-[10px] ml-0.5"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            k
          </kbd>{' '}
          Navigate
        </span>
        <span>
          <kbd
            className="px-1.5 py-0.5 rounded font-mono text-[10px]"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            Enter
          </kbd>{' '}
          Expand
        </span>
        <span>
          <kbd
            className="px-1.5 py-0.5 rounded font-mono text-[10px]"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            r
          </kbd>{' '}
          Refresh
        </span>
        <span>
          <kbd
            className="px-1.5 py-0.5 rounded font-mono text-[10px]"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            Esc
          </kbd>{' '}
          Clear
        </span>
      </div>
    </div>
  );
}
