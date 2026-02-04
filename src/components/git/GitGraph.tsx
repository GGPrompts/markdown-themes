import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { calculateGraphLayout, type Commit, type GraphLayout } from '../../lib/graphLayout';
import { GitGraphCanvas } from './GitGraphCanvas';
import { GitGraphRow } from './GitGraphRow';

const API_BASE = 'http://localhost:8129';
const ROW_HEIGHT = 40;
const RAIL_WIDTH = 20;
const NODE_RADIUS = 6;
const PAGE_SIZE = 50;

interface GitGraphProps {
  repoPath: string;
  onCommitSelect?: (hash: string) => void;
  className?: string;
}

interface GraphState {
  commits: Commit[];
  layout: GraphLayout;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  skip: number;
}

export function GitGraph({ repoPath, onCommitSelect, className = '' }: GitGraphProps) {
  const [state, setState] = useState<GraphState>({
    commits: [],
    layout: { nodes: [], connections: [], railCount: 0 },
    loading: true,
    loadingMore: false,
    error: null,
    hasMore: true,
    skip: 0,
  });
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch commits from the API
  const fetchCommits = useCallback(async (skip: number, append: boolean = false) => {
    try {
      const url = `${API_BASE}/api/git/graph?path=${encodeURIComponent(repoPath)}&limit=${PAGE_SIZE}&skip=${skip}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to fetch graph: ${response.status}`);
      }

      const data = await response.json();
      const newCommits: Commit[] = data.data?.commits || [];
      const hasMoreFromApi = data.data?.hasMore ?? false;

      setState((prev) => {
        const allCommits = append ? [...prev.commits, ...newCommits] : newCommits;
        const layout = calculateGraphLayout(allCommits);

        return {
          ...prev,
          commits: allCommits,
          layout,
          loading: false,
          loadingMore: false,
          error: null,
          hasMore: hasMoreFromApi,
          skip: skip + newCommits.length,
        };
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        loadingMore: false,
        error: err instanceof Error ? err.message : 'Failed to fetch git graph',
      }));
    }
  }, [repoPath]);

  // Initial fetch
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      commits: [],
      layout: { nodes: [], connections: [], railCount: 0 },
      loading: true,
      error: null,
      hasMore: true,
      skip: 0,
    }));
    fetchCommits(0, false);
  }, [fetchCommits]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!containerRef.current || state.loadingMore || !state.hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const scrollThreshold = 200; // px from bottom

    if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
      setState((prev) => ({ ...prev, loadingMore: true }));
      fetchCommits(state.skip, true);
    }
  }, [state.loadingMore, state.hasMore, state.skip, fetchCommits]);

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Handle commit click
  const handleCommitClick = useCallback((hash: string) => {
    setSelectedHash(hash);
    onCommitSelect?.(hash);
  }, [onCommitSelect]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setState((prev) => ({
      ...prev,
      commits: [],
      layout: { nodes: [], connections: [], railCount: 0 },
      loading: true,
      error: null,
      hasMore: true,
      skip: 0,
    }));
    fetchCommits(0, false);
  }, [fetchCommits]);

  // Calculate canvas dimensions
  const canvasWidth = (state.layout.railCount + 1) * RAIL_WIDTH;
  const canvasHeight = state.layout.nodes.length * ROW_HEIGHT;

  // Loading state
  if (state.loading && state.commits.length === 0) {
    return (
      <div className={`git-graph flex items-center justify-center h-full ${className}`}>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading git history...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error && state.commits.length === 0) {
    return (
      <div className={`git-graph flex items-center justify-center h-full ${className}`}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#f87171' }} />
          <p className="text-sm mb-3" style={{ color: '#f87171' }}>{state.error}</p>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded mx-auto"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (state.commits.length === 0) {
    return (
      <div className={`git-graph flex items-center justify-center h-full ${className}`}>
        <div className="text-center" style={{ color: 'var(--text-secondary)' }}>
          <p>No commits found</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`git-graph h-full overflow-auto ${className}`}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Header with refresh button */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-3 py-2"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Git History
        </span>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded transition-colors hover:bg-[var(--bg-primary)]"
          style={{ color: 'var(--text-secondary)' }}
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Graph container */}
      <div className="relative" style={{ minHeight: canvasHeight }}>
        {/* Canvas layer for rail lines */}
        <GitGraphCanvas
          connections={state.layout.connections}
          railCount={state.layout.railCount}
          rowHeight={ROW_HEIGHT}
          railWidth={RAIL_WIDTH}
          nodeRadius={NODE_RADIUS}
          width={canvasWidth}
          height={canvasHeight}
        />

        {/* Rows layer */}
        <div className="relative" style={{ marginLeft: canvasWidth }}>
          {state.layout.nodes.map((node) => (
            <GitGraphRow
              key={node.hash}
              node={node}
              rowHeight={ROW_HEIGHT}
              isSelected={selectedHash === node.hash}
              onClick={() => handleCommitClick(node.hash)}
            />
          ))}
        </div>

        {/* Node circles (drawn on top of canvas, positioned absolutely) */}
        <div className="absolute top-0 left-0" style={{ width: canvasWidth, height: canvasHeight, pointerEvents: 'none' }}>
          {state.layout.nodes.map((node) => {
            const isMerge = node.parents.length > 1;
            const isHead = node.refs.some((ref) => ref === 'HEAD' || ref.includes('HEAD ->'));
            const cx = (node.rail + 0.5) * RAIL_WIDTH;
            const cy = node.row * ROW_HEIGHT + ROW_HEIGHT / 2;

            return (
              <div
                key={`node-${node.hash}`}
                className="absolute rounded-full"
                style={{
                  left: cx - NODE_RADIUS,
                  top: cy - NODE_RADIUS,
                  width: NODE_RADIUS * 2,
                  height: NODE_RADIUS * 2,
                  backgroundColor: isMerge ? 'var(--bg-primary)' : `var(--rail-color-${node.rail % 8})`,
                  border: `2px solid var(--rail-color-${node.rail % 8})`,
                  boxShadow: isHead ? '0 0 0 2px var(--accent)' : undefined,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                }}
                onClick={() => handleCommitClick(node.hash)}
                title={node.shortHash}
              />
            );
          })}
        </div>
      </div>

      {/* Loading more indicator */}
      {state.loadingMore && (
        <div className="flex items-center justify-center py-4" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">Loading more...</span>
        </div>
      )}

      {/* End of history indicator */}
      {!state.hasMore && state.commits.length > 0 && (
        <div className="text-center py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          End of history ({state.commits.length} commits)
        </div>
      )}
    </div>
  );
}
