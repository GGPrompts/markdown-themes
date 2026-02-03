import { useState, useMemo, useCallback } from 'react';
import type { FileTreeNode } from '../context/WorkspaceContext';
import { FILTERS, filterFiles, countMatches, type FilterId } from '../lib/filters';

interface UseFileFilterResult {
  /** Currently active filter ID, or null if no filter is active */
  activeFilter: FilterId | null;
  /** Apply a predefined filter by ID */
  setFilter: (filterId: FilterId | null) => void;
  /** Clear the active filter (show all files) */
  clearFilter: () => void;
  /** The filtered file tree (or original if no filter active) */
  filteredFiles: FileTreeNode[];
  /** Number of files matching the current filter */
  matchCount: number;
  /** Whether a filter is currently active */
  isFiltered: boolean;
}

/**
 * Hook for managing file filter state in the Sidebar.
 *
 * @param files - The original file tree from useWorkspace
 * @returns Filter state and actions
 */
export function useFileFilter(files: FileTreeNode[]): UseFileFilterResult {
  const [activeFilter, setActiveFilter] = useState<FilterId | null>(null);

  const setFilter = useCallback((filterId: FilterId | null) => {
    setActiveFilter(filterId);
  }, []);

  const clearFilter = useCallback(() => {
    setActiveFilter(null);
  }, []);

  const activeFilterDef = useMemo(
    () => FILTERS.find((f) => f.id === activeFilter) ?? null,
    [activeFilter]
  );

  const filteredFiles = useMemo(() => {
    if (!activeFilterDef) {
      return files;
    }
    return filterFiles(files, activeFilterDef.patterns);
  }, [files, activeFilterDef]);

  const matchCount = useMemo(() => {
    if (!activeFilterDef) {
      return 0;
    }
    return countMatches(files, activeFilterDef.patterns);
  }, [files, activeFilterDef]);

  return {
    activeFilter,
    setFilter,
    clearFilter,
    filteredFiles,
    matchCount,
    isFiltered: activeFilter !== null,
  };
}
