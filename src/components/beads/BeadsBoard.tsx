import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { fetchBeadsIssues, type BeadsIssue } from '../../lib/api';
import { BeadsCard } from './BeadsCard';
import { BeadsDetail } from './BeadsDetail';

interface BeadsBoardProps {
  workspacePath: string | null;
  fontSize?: number;
}

interface ColumnDef {
  key: string;
  title: string;
  defaultExpanded: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'backlog', title: 'Backlog', defaultExpanded: true },
  { key: 'ready', title: 'Ready', defaultExpanded: true },
  { key: 'in-progress', title: 'In Progress', defaultExpanded: true },
  { key: 'blocked', title: 'Blocked', defaultExpanded: false },
  { key: 'done', title: 'Done', defaultExpanded: false },
];

export function BeadsBoard({ workspacePath, fontSize = 100 }: BeadsBoardProps) {
  const [issues, setIssues] = useState<BeadsIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<BeadsIssue | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    COLUMNS.forEach((col) => {
      initial[col.key] = !col.defaultExpanded;
    });
    return initial;
  });

  const loadIssues = useCallback(async () => {
    if (!workspacePath) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBeadsIssues(workspacePath);
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // Build a set of open issue IDs for dependency resolution
  const openIssueIds = useMemo(() => {
    const ids = new Set<string>();
    issues.forEach((issue) => {
      if (issue.status !== 'closed') ids.add(issue.id);
    });
    return ids;
  }, [issues]);

  // Compute blocking dependencies for each issue (only unresolved ones)
  const blockedByMap = useMemo(() => {
    const map = new Map<string, string[]>();
    issues.forEach((issue) => {
      if (!issue.dependencies) return;
      const blockers = issue.dependencies
        .filter((d) => d.type === 'blocks' && d.depends_on_id !== issue.id && openIssueIds.has(d.depends_on_id))
        .map((d) => d.depends_on_id);
      if (blockers.length > 0) {
        map.set(issue.id, blockers);
      }
    });
    return map;
  }, [issues, openIssueIds]);

  // Categorize issues into columns
  const columns = useMemo(() => {
    const buckets: Record<string, BeadsIssue[]> = {
      backlog: [],
      ready: [],
      'in-progress': [],
      blocked: [],
      done: [],
    };

    issues.forEach((issue) => {
      if (issue.status === 'closed') {
        buckets.done.push(issue);
        return;
      }
      if (issue.status === 'in_progress') {
        buckets['in-progress'].push(issue);
        return;
      }
      // status === 'open'
      const hasBlockers = blockedByMap.has(issue.id);
      if (hasBlockers) {
        buckets.blocked.push(issue);
        return;
      }
      const hasReadyLabel = issue.labels?.includes('ready');
      if (hasReadyLabel) {
        buckets.ready.push(issue);
      } else {
        buckets.backlog.push(issue);
      }
    });

    // Limit done to 20 most recent (by closed_at)
    buckets.done.sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
    buckets.done = buckets.done.slice(0, 20);

    // Sort others by priority (lower = higher priority)
    ['backlog', 'ready', 'in-progress', 'blocked'].forEach((key) => {
      buckets[key].sort((a, b) => a.priority - b.priority);
    });

    return buckets;
  }, [issues, blockedByMap]);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const scale = fontSize / 100;

  if (!workspacePath) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: 'var(--text-secondary)' }}>No workspace selected</p>
      </div>
    );
  }

  // Show detail view when an issue is selected
  if (selectedIssue) {
    return (
      <BeadsDetail
        issue={selectedIssue}
        fontSize={fontSize}
        onBack={() => setSelectedIssue(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ fontSize: `${scale}rem` }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Beads Board
        </span>
        <button
          onClick={loadIssues}
          disabled={loading}
          className="w-7 h-7 flex items-center justify-center rounded transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          title="Refresh issues"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-3 py-2 text-sm" style={{ color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && issues.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <Inbox size={40} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No .beads/ directory found
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
            Run <code style={{ fontFamily: 'var(--font-mono)' }}>bd create --title="..."</code> to get started
          </p>
        </div>
      )}

      {/* Board columns */}
      {issues.length > 0 && (
        <div className="beads-board">
          {COLUMNS.map((col) => {
            const items = columns[col.key] ?? [];
            const isCollapsed = collapsed[col.key];

            return (
              <div key={col.key} className="beads-column">
                <button
                  className="beads-column-header"
                  onClick={() => toggleCollapse(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <span>{col.title}</span>
                  </div>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: items.length > 0
                        ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                        : 'transparent',
                      color: items.length > 0 ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {items.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="beads-column-body">
                    {items.length === 0 ? (
                      <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        No issues
                      </p>
                    ) : (
                      items.map((issue) => (
                        <BeadsCard
                          key={issue.id}
                          issue={issue}
                          blockedByIds={blockedByMap.get(issue.id)}
                          onSelect={setSelectedIssue}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
