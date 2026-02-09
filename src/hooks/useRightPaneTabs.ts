import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { RightPaneTab } from '../context/PageStateContext';

interface UseRightPaneTabsOptions {
  initialTabs?: RightPaneTab[];
  initialActiveTabId?: string | null;
  onStateChange?: (tabs: RightPaneTab[], activeTabId: string | null) => void;
}

interface OpenTabOptions {
  preview?: boolean;
  /** If true, add as new tab instead of replacing existing preview */
  addNew?: boolean;
}

interface UseRightPaneTabsResult {
  tabs: RightPaneTab[];
  activeTabId: string | null;
  activeTab: RightPaneTab | null;
  openTab: (path: string, options?: boolean | OpenTabOptions) => void;
  pinTab: (id: string) => void;
  unpinTab: (id: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  clearAllTabs: () => void;
}

function generateTabId(): string {
  return `rtab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useRightPaneTabs(options: UseRightPaneTabsOptions = {}): UseRightPaneTabsResult {
  const { initialTabs = [], initialActiveTabId = null, onStateChange } = options;

  const [tabs, setTabs] = useState<RightPaneTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(initialActiveTabId);

  // Track if this is the initial mount to avoid triggering onStateChange
  const isInitialMount = useRef(true);

  // Use ref for tabs to avoid stale closures in callbacks
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Notify parent of state changes (skip initial mount)
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
    const { preview = true, addNew = false } = options;

    const currentTabs = tabsRef.current;

    // Check if file is already open in a pinned or unpinned (non-preview) tab
    const existingTab = currentTabs.find((t) => t.path === path && !t.isPreview);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // Check if file is already open in a preview tab
    const existingPreviewTab = currentTabs.find((t) => t.path === path && t.isPreview);
    if (existingPreviewTab) {
      setActiveTabId(existingPreviewTab.id);
      return;
    }

    if (preview) {
      // Replace existing preview tab or create new one
      const newTab: RightPaneTab = {
        id: generateTabId(),
        path,
        isPreview: true,
        isPinned: false,
      };

      setTabs((prevTabs) => {
        // If addNew is true, always add as new tab (for Follow AI Edits)
        if (addNew) {
          return [...prevTabs, newTab];
        }

        const existingPreviewIndex = prevTabs.findIndex((t) => t.isPreview);
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
        const previewTabIndex = prevTabs.findIndex((t) => t.path === path && t.isPreview);
        if (previewTabIndex >= 0) {
          const newTabs = [...prevTabs];
          newTabs[previewTabIndex] = {
            ...newTabs[previewTabIndex],
            isPreview: false,
            isPinned: true,
          };
          setActiveTabId(prevTabs[previewTabIndex].id);
          return newTabs;
        }

        // Create new pinned tab
        const newTab: RightPaneTab = {
          id: generateTabId(),
          path,
          isPreview: false,
          isPinned: true,
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

  const unpinTab = useCallback((id: string) => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.id === id ? { ...tab, isPinned: false } : tab
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

  const clearAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
  }, []);

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    pinTab,
    unpinTab,
    closeTab,
    setActiveTab,
    clearAllTabs,
  };
}
