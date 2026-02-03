import { useState, useCallback, useMemo } from 'react';

export interface Tab {
  id: string;
  path: string;
  isPreview: boolean;
  isPinned: boolean;
}

interface UseTabManagerResult {
  tabs: Tab[];
  activeTabId: string | null;
  activeTab: Tab | null;
  openTab: (path: string, preview?: boolean) => void;
  pinTab: (id: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useTabManager(): UseTabManagerResult {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const openTab = useCallback((path: string, preview = true) => {
    // Check if file is already open in a pinned tab
    const existingPinnedTab = tabs.find((t) => t.path === path && t.isPinned);
    if (existingPinnedTab) {
      setActiveTabId(existingPinnedTab.id);
      return;
    }

    // Check if file is already open in a preview tab
    const existingPreviewTab = tabs.find((t) => t.path === path && t.isPreview);
    if (existingPreviewTab) {
      setActiveTabId(existingPreviewTab.id);
      return;
    }

    if (preview) {
      // Replace existing preview tab or create new one
      const existingPreviewIndex = tabs.findIndex((t) => t.isPreview);
      const newTab: Tab = {
        id: generateTabId(),
        path,
        isPreview: true,
        isPinned: false,
      };

      if (existingPreviewIndex >= 0) {
        // Replace existing preview tab
        setTabs((prevTabs) => {
          const newTabs = [...prevTabs];
          newTabs[existingPreviewIndex] = newTab;
          return newTabs;
        });
      } else {
        // Add new preview tab at the end
        setTabs((prevTabs) => [...prevTabs, newTab]);
      }
      setActiveTabId(newTab.id);
    } else {
      // Opening as pinned (double-click behavior)
      // First check if there's a preview tab for this file - convert it to pinned
      const previewTabIndex = tabs.findIndex((t) => t.path === path && t.isPreview);
      if (previewTabIndex >= 0) {
        const tabId = tabs[previewTabIndex].id;
        setTabs((prevTabs) => {
          const newTabs = [...prevTabs];
          newTabs[previewTabIndex] = {
            ...newTabs[previewTabIndex],
            isPreview: false,
            isPinned: true,
          };
          return newTabs;
        });
        setActiveTabId(tabId);
        return;
      }

      // Create new pinned tab
      const newTab: Tab = {
        id: generateTabId(),
        path,
        isPreview: false,
        isPinned: true,
      };
      setTabs((prevTabs) => [...prevTabs, newTab]);
      setActiveTabId(newTab.id);
    }
  }, [tabs]);

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

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    pinTab,
    closeTab,
    setActiveTab,
  };
}
