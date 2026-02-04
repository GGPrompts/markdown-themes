import { useState, useEffect, useRef, useCallback } from 'react';
import { parseDiff } from '../components/viewers/DiffViewer';

const API_BASE = 'http://localhost:8129';

export type GitDiffLineType = 'added' | 'modified' | 'deleted';

interface UseGitDiffOptions {
  /** Full file path to get diff for */
  filePath: string | null;
  /** Repository root path */
  repoPath: string | null;
  /** Content to trigger refetch on change (debounced) */
  content?: string;
  /** Debounce delay in ms (default 500) */
  debounceMs?: number;
}

interface UseGitDiffResult {
  /** Map of line numbers (1-based) to change type */
  changedLines: Map<number, GitDiffLineType>;
  /** Whether diff is currently loading */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually refetch the diff */
  refetch: () => void;
}

/**
 * Extract line changes from a git diff for a single file.
 * Returns a map of line numbers to their change type.
 *
 * For added lines: marks newLineNumber as 'added'
 * For deleted lines: marks oldLineNumber as 'deleted' (shown in gutter only)
 * For modified lines (addition after deletion of same line): marks as 'modified'
 */
function extractLineChanges(diffText: string): Map<number, GitDiffLineType> {
  const changedLines = new Map<number, GitDiffLineType>();
  const files = parseDiff(diffText);

  if (files.length === 0) {
    return changedLines;
  }

  // We expect a single file diff
  const file = files[0];

  // Track deletions so we can detect modifications (deletion + addition at same position)
  const deletedOldLines = new Set<number>();

  for (const hunk of file.hunks) {
    // First pass: collect deleted line numbers
    for (const line of hunk.lines) {
      if (line.type === 'deletion' && line.oldLineNumber !== null) {
        deletedOldLines.add(line.oldLineNumber);
      }
    }

    // Second pass: process additions and mark deletions
    // Track which new line positions map to old positions
    let oldLineOffset = hunk.oldStart;
    let newLineOffset = hunk.newStart;

    for (const line of hunk.lines) {
      if (line.type === 'addition' && line.newLineNumber !== null) {
        // Check if this could be a modification (replacing a deleted line)
        // This is a heuristic: if the line number in new content corresponds
        // to a deleted line in old content, it's likely a modification
        const correspondingOldLine = oldLineOffset;
        if (deletedOldLines.has(correspondingOldLine)) {
          changedLines.set(line.newLineNumber, 'modified');
          deletedOldLines.delete(correspondingOldLine);
        } else {
          changedLines.set(line.newLineNumber, 'added');
        }
      } else if (line.type === 'deletion' && line.oldLineNumber !== null) {
        // Mark deleted lines - these won't exist in new content
        // so we use the old line number for gutter display
        changedLines.set(line.oldLineNumber, 'deleted');
      }

      // Update line offsets for tracking
      if (line.type === 'context') {
        oldLineOffset++;
        newLineOffset++;
      } else if (line.type === 'deletion') {
        oldLineOffset++;
      } else if (line.type === 'addition') {
        newLineOffset++;
      }
    }
  }

  // Remove 'deleted' entries since they reference old line numbers
  // which don't exist in the new file. The CodeViewer only shows
  // the new file content, so we can only highlight added/modified lines.
  for (const [lineNum, type] of changedLines) {
    if (type === 'deleted') {
      changedLines.delete(lineNum);
    }
  }

  return changedLines;
}

/**
 * Hook to fetch and parse git diff for a file.
 * Automatically refetches when content changes (debounced).
 */
export function useGitDiff({
  filePath,
  repoPath,
  content,
  debounceMs = 500,
}: UseGitDiffOptions): UseGitDiffResult {
  const [changedLines, setChangedLines] = useState<Map<number, GitDiffLineType>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(data.error || null);
        setLoading(false);
        return;
      }

      const lines = extractLineChanges(data.data?.diff || '');
      setChangedLines(lines);
      setLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      console.error('Failed to fetch git diff:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch diff');
      setChangedLines(new Map());
      setLoading(false);
    }
  }, [getRelativePath, repoPath]);

  // Refetch when content changes (debounced)
  useEffect(() => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!filePath || !repoPath) {
      setChangedLines(new Map());
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
  }, [filePath, repoPath, content, debounceMs, fetchDiff]);

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

  return {
    changedLines,
    loading,
    error,
    refetch: fetchDiff,
  };
}
