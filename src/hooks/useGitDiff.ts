import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { parseDiff } from '../components/viewers/DiffViewer';

const API_BASE = 'http://localhost:8130';

export type GitDiffLineType = 'added' | 'modified' | 'deleted';

/** A deleted line with its content and position in the new file */
export interface DeletedLine {
  /** Insert this deleted line after this line number in the new file (0 = at start) */
  afterLine: number;
  /** The content of the deleted line */
  content: string;
}

interface UseGitDiffOptions {
  /** Full file path to get diff for */
  filePath: string | null;
  /** Repository root path */
  repoPath: string | null;
  /** Content to trigger refetch on change (debounced) */
  content?: string;
  /** Debounce delay in ms (default 500) */
  debounceMs?: number;
  /** Whether to enable git diff fetching (default true). Set to false during streaming. */
  enabled?: boolean;
}

interface UseGitDiffResult {
  /** Map of line numbers (1-based) to change type */
  changedLines: Map<number, GitDiffLineType>;
  /** Deleted lines with their content and position */
  deletedLines: DeletedLine[];
  /** Whether diff is currently loading */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually refetch the diff */
  refetch: () => void;
}

interface ExtractedChanges {
  changedLines: Map<number, GitDiffLineType>;
  deletedLines: DeletedLine[];
}

/**
 * Extract line changes from a git diff for a single file.
 * Returns a map of line numbers to their change type, plus deleted lines with content.
 *
 * For added lines: marks newLineNumber as 'added'
 * For modified lines (addition after deletion): marks as 'modified'
 * For deleted lines: returns the content and position where they should appear
 */
function extractLineChanges(diffText: string): ExtractedChanges {
  const changedLines = new Map<number, GitDiffLineType>();
  const deletedLines: DeletedLine[] = [];
  const files = parseDiff(diffText);

  if (files.length === 0) {
    return { changedLines, deletedLines };
  }

  // We expect a single file diff
  const file = files[0];

  for (const hunk of file.hunks) {
    // Track position in new file for placing deleted lines
    let newLinePos = hunk.newStart - 1; // 0-based position before the hunk starts

    // Collect consecutive deletions to detect modifications
    let pendingDeletions: { content: string; afterLine: number }[] = [];

    for (const line of hunk.lines) {
      if (line.type === 'context') {
        // Flush any pending deletions as actual deletions
        for (const del of pendingDeletions) {
          deletedLines.push(del);
        }
        pendingDeletions = [];
        newLinePos++;
      } else if (line.type === 'deletion') {
        // Queue deletion - might be a modification if followed by addition
        pendingDeletions.push({
          content: line.content,
          afterLine: newLinePos,
        });
      } else if (line.type === 'addition' && line.newLineNumber !== null) {
        if (pendingDeletions.length > 0) {
          // This addition replaces a deletion - it's a modification
          changedLines.set(line.newLineNumber, 'modified');
          pendingDeletions.shift(); // Consume one pending deletion
        } else {
          // Pure addition
          changedLines.set(line.newLineNumber, 'added');
        }
        newLinePos++;
      }
    }

    // Flush remaining deletions at end of hunk
    for (const del of pendingDeletions) {
      deletedLines.push(del);
    }
  }

  return { changedLines, deletedLines };
}

/**
 * Hook to fetch and parse git diff for a file.
 * Automatically refetches when content changes (debounced).
 *
 * When `enabled` is false (e.g., during streaming), returns a stable
 * empty Map to avoid render thrashing from rapid content updates.
 */
export function useGitDiff({
  filePath,
  repoPath,
  content,
  debounceMs = 500,
  enabled = true,
}: UseGitDiffOptions): UseGitDiffResult {
  const [changedLines, setChangedLines] = useState<Map<number, GitDiffLineType>>(new Map());
  const [deletedLines, setDeletedLines] = useState<DeletedLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable empty references to avoid unnecessary re-renders.
  const emptyMap = useMemo(() => new Map<number, GitDiffLineType>(), []);
  const emptyArray = useMemo(() => [] as DeletedLine[], []);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Calculate relative path from repo root
  const getRelativePath = useCallback(() => {
    if (!filePath || !repoPath) return null;
    if (!filePath.startsWith(repoPath)) return null;
    const relative = filePath.slice(repoPath.length);
    // Remove leading slash
    return relative.startsWith('/') ? relative.slice(1) : relative;
  }, [filePath, repoPath]);

  const fetchDiff = useCallback(async () => {
    const relativePath = getRelativePath();
    if (!relativePath || !repoPath) {
      setChangedLines(new Map());
      setDeletedLines([]);
      setLoading(false);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        path: repoPath,
        file: relativePath,
      });

      const response = await fetch(`${API_BASE}/api/git/diff?${params}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No diff available (file not in git, or no changes)
          setChangedLines(new Map());
          setDeletedLines([]);
          setLoading(false);
          return;
        }
        throw new Error(`Failed to fetch diff: ${response.status}`);
      }

      const data = await response.json();

      // API returns { success: true, data: { diff: "..." } } or { success: false, error: "..." }
      if (!data.success) {
        // No diff or error - just clear highlights
        setChangedLines(new Map());
        setDeletedLines([]);
        setError(data.error || null);
        setLoading(false);
        return;
      }

      const result = extractLineChanges(data.data?.diff || '');
      setChangedLines(result.changedLines);
      setDeletedLines(result.deletedLines);
      setLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      console.error('Failed to fetch git diff:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch diff');
      setChangedLines(new Map());
      setDeletedLines([]);
      setLoading(false);
    }
  }, [getRelativePath, repoPath]);

  // Refetch when content changes (debounced)
  useEffect(() => {
    // Skip fetching when disabled (e.g., during streaming)
    if (!enabled) {
      return;
    }

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!filePath || !repoPath) {
      setChangedLines(new Map());
      setDeletedLines([]);
      return;
    }

    // Debounce the fetch
    debounceTimerRef.current = setTimeout(() => {
      fetchDiff();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filePath, repoPath, content, debounceMs, fetchDiff, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Return stable empty values when disabled to avoid re-renders
  return {
    changedLines: enabled ? changedLines : emptyMap,
    deletedLines: enabled ? deletedLines : emptyArray,
    loading: enabled ? loading : false,
    error: enabled ? error : null,
    refetch: fetchDiff,
  };
}
