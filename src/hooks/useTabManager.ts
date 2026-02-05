import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// Diff data for diff tabs
export interface DiffData {
  base: string;  // commit hash
  head?: string; // optional head commit hash
  file: string;  // file path within repo
}

export interface TabMetadata {
  /** Tab was auto-opened by Follow AI Edits mode */
  autoOpened?: boolean;
}

export interface Tab {
  id: string;
  path: string;
  isPreview: boolean;
  isPinned: boolean;
  type: 'file' | 'diff';
  diffData?: DiffData;
  metadata?: TabMetadata;
}

interface UseTabManagerOptions {
  initialTabs?: Tab[];
  initialActiveTabId?: string | null;
  onStateChange?: (tabs: Tab[], activeTabId: string | null) => void;
}

interface OpenTabOptions {
  preview?: boolean;
  metadata?: TabMetadata;
}

interface UseTabManagerResult {
  tabs: Tab[];
  activeTabId: string | null;
  activeTab: Tab | null;
  openTab: (path: string, options?: boolean | OpenTabOptions) => void;
  openDiffTab: (base: string, file: string, head?: string) => void;
  pinTab: (id: string) => void;
  closeTab: (id: string) => void;
  closeTabsWithMetadata: (predicate: (metadata: TabMetadata | undefined) => boolean) => void;
  setActiveTab: (id: string) => void;
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useTabManager(options: UseTabManagerOptions = {}): UseTabManagerResult {
  const { initialTabs = [], initialActiveTabId = null, onStateChange } = options;

  const [tabs, setTabs] = useState<Tab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(initialActiveTabId);

  // Track if this is the initial mount to avoid triggering onStateChange
  const isInitialMount = useRef(true);

  // Use ref for tabs to avoid stale closures in callbacks
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Notify parent of state changes (skip initial mount)
  // Use refs to avoid re-running effect when callback changes
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onStateChangeRef.current?.(tabs, activeTabId);
  }, [tabs, activeTabId]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const openTab = useCallback((path: string, optionsOrPreview: boolean | OpenTabOptions = true) => {
    // Support both legacy boolean and new options object
    const options: OpenTabOptions = typeof optionsOrPreview === 'boolean'
      ? { preview: optionsOrPreview }
      : optionsOrPreview;
    const { preview = true, metadata } = options;

    // Use ref to get current tabs without dependency
    const currentTabs = tabsRef.current;

    // Check if file is already open in a pinned tab
    const existingPinnedTab = currentTabs.find((t) => t.type === 'file' && t.path === path && t.isPinned);
    if (existingPinnedTab) {
      setActiveTabId(existingPinnedTab.id);
      return;
    }

    // Check if file is already open in a preview tab
    const existingPreviewTab = currentTabs.find((t) => t.type === 'file' && t.path === path && t.isPreview);
    if (existingPreviewTab) {
      setActiveTabId(existingPreviewTab.id);
      return;
    }

    // Check if file is already open as an auto-opened tab
    const existingAutoTab = currentTabs.find((t) => t.type === 'file' && t.path === path && t.metadata?.autoOpened);
    if (existingAutoTab) {
      setActiveTabId(existingAutoTab.id);
      return;
    }

    if (preview) {
      // Replace existing preview tab or create new one
      const newTab: Tab = {
        id: generateTabId(),
        path,
        isPreview: true,
        isPinned: false,
        type: 'file',
        metadata,
      };

      setTabs((prevTabs) => {
        // For auto-opened tabs, don't replace existing preview tabs - add new ones
        if (metadata?.autoOpened) {
          return [...prevTabs, newTab];
        }

        const existingPreviewIndex = prevTabs.findIndex((t) => t.isPreview && t.type === 'file' && !t.metadata?.autoOpened);
        if (existingPreviewIndex >= 0) {
          // Replace existing preview tab
          const newTabs = [...prevTabs];
          newTabs[existingPreviewIndex] = newTab;
          return newTabs;
        } else {
          // Add new preview tab at the end
          return [...prevTabs, newTab];
        }
      });
      setActiveTabId(newTab.id);
    } else {
      // Opening as pinned (double-click behavior)
      setTabs((prevTabs) => {
        // First check if there's a preview tab for this file - convert it to pinned
        const previewTabIndex = prevTabs.findIndex((t) => t.type === 'file' && t.path === path && t.isPreview);
        if (previewTabIndex >= 0) {
          const newTabs = [...prevTabs];
          newTabs[previewTabIndex] = {
            ...newTabs[previewTabIndex],
            isPreview: false,
            isPinned: true,
            metadata: undefined, // Clear auto-opened metadata when pinning
          };
          setActiveTabId(prevTabs[previewTabIndex].id);
          return newTabs;
        }

        // Create new pinned tab
        const newTab: Tab = {
          id: generateTabId(),
          path,
          isPreview: false,
          isPinned: true,
          type: 'file',
        };
        setActiveTabId(newTab.id);
        return [...prevTabs, newTab];
      });
    }
  }, []);

  const pinTab = useCallback((id: string) => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.id === id ? { ...tab, isPreview: false, isPinned: true } : tab
      )
    );
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prevTabs) => {
      const tabIndex = prevTabs.findIndex((t) => t.id === id);
      if (tabIndex === -1) return prevTabs;

      const newTabs = prevTabs.filter((t) => t.id !== id);

      // Update active tab if we're closing the active one
      setActiveTabId((currentActiveId) => {
        if (currentActiveId !== id) return currentActiveId;
        if (newTabs.length === 0) return null;

        // Prefer the tab to the right, then to the left
        const nextIndex = Math.min(tabIndex, newTabs.length - 1);
        return newTabs[nextIndex].id;
      });

      return newTabs;
    });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const closeTabsWithMetadata = useCallback((predicate: (metadata: TabMetadata | undefined) => boolean) => {
    setTabs((prevTabs) => {
      const tabsToClose = prevTabs.filter((t) => predicate(t.metadata));
      if (tabsToClose.length === 0) return prevTabs;

      const tabIdsToClose = new Set(tabsToClose.map((t) => t.id));
      const newTabs = prevTabs.filter((t) => !tabIdsToClose.has(t.id));

      // Update active tab if we're closing the active one
      setActiveTabId((currentActiveId) => {
        if (!currentActiveId || !tabIdsToClose.has(currentActiveId)) return currentActiveId;
        if (newTabs.length === 0) return null;

        // Find the first remaining tab
        return newTabs[0].id;
      });

      return newTabs;
    });
  }, []);

  const openDiffTab = useCallback((base: string, file: string, head?: string) => {
    const currentTabs = tabsRef.current;

    // Create a unique identifier for this diff
    const diffId = `${base.substring(0, 7)}:${file}`;

    // Check if this diff is already open
    const existingDiffTab = currentTabs.find(
      (t) => t.type === 'diff' && t.diffData?.base === base && t.diffData?.file === file
    );
    if (existingDiffTab) {
      setActiveTabId(existingDiffTab.id);
      return;
    }

    // Create new diff tab (always pinned, never preview)
    const newTab: Tab = {
      id: generateTabId(),
      path: diffId, // Used for display purposes
      isPreview: false,
      isPinned: true,
      type: 'diff',
      diffData: { base, file, head },
    };

    setTabs((prevTabs) => [...prevTabs, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    openDiffTab,
    pinTab,
    closeTab,
    closeTabsWithMetadata,
    setActiveTab,
  };
}
