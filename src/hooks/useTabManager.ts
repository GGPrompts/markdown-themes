import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// Diff data for diff tabs
export interface DiffData {
  base: string;  // commit hash
  head?: string; // optional head commit hash
  file: string;  // file path within repo
}

// Conversation data for subagent conversation tabs
export interface ConversationData {
  sessionId: string;
  workingDir: string;
  pane: string;
  taskDescription?: string;
  /** Auto-close tab when subagent ends */
  autoClose?: boolean;
}

export interface TabMetadata {
  /** Tab was auto-opened by Follow AI Edits mode */
  autoOpened?: boolean;
  /** Tab was auto-opened for subagent conversation */
  subagentConversation?: boolean;
}

export type ViewTabType = 'git-graph' | 'working-tree' | 'beads-board';

export interface Tab {
  id: string;
  path: string;
  isPreview: boolean;
  isPinned: boolean;
  type: 'file' | 'diff' | 'conversation' | ViewTabType;
  diffData?: DiffData;
  conversationData?: ConversationData;
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

// Well-known paths for view tabs (not real files)
const VIEW_TAB_PATHS: Record<ViewTabType, string> = {
  'git-graph': '__git-graph__',
  'working-tree': '__working-tree__',
  'beads-board': '__beads-board__',
};

interface UseTabManagerResult {
  tabs: Tab[];
  activeTabId: string | null;
  activeTab: Tab | null;
  openTab: (path: string, options?: boolean | OpenTabOptions) => void;
  openDiffTab: (base: string, file: string, head?: string) => void;
  openConversationTab: (path: string, data: ConversationData) => void;
  closeConversationTab: (sessionId: string) => void;
  openViewTab: (viewType: ViewTabType) => string;
  closeViewTab: (viewType: ViewTabType) => void;
  pinTab: (id: string) => void;
  unpinTab: (id: string) => void;
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

    // Check if file is already open in a pinned or unpinned (non-preview) tab
    const existingTab = currentTabs.find((t) => t.type === 'file' && t.path === path && !t.isPreview);
    if (existingTab) {
      setActiveTabId(existingTab.id);
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
      // Note: currentTabs is already defined at the top of this function - use that snapshot
      // to avoid race conditions from reading tabsRef.current multiple times

      // First check if there's a preview tab for this file - convert it to pinned
      const existingPreviewTab = currentTabs.find((t) => t.type === 'file' && t.path === path && t.isPreview);
      if (existingPreviewTab) {
        setTabs((prevTabs) => {
          const previewTabIndex = prevTabs.findIndex((t) => t.id === existingPreviewTab.id);
          if (previewTabIndex < 0) return prevTabs;
          const newTabs = [...prevTabs];
          newTabs[previewTabIndex] = {
            ...newTabs[previewTabIndex],
            isPreview: false,
            isPinned: true,
            metadata: undefined, // Clear auto-opened metadata when pinning
          };
          return newTabs;
        });
        setActiveTabId(existingPreviewTab.id);
        return;
      }

      // Create new pinned tab
      const newTab: Tab = {
        id: generateTabId(),
        path,
        isPreview: false,
        isPinned: true,
        type: 'file',
      };
      setTabs((prevTabs) => [...prevTabs, newTab]);
      setActiveTabId(newTab.id);
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
        tab.id === id ? { ...tab, isPinned: false, isPreview: true } : tab
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

    // Check if this exact diff is already open
    const existingDiffTab = currentTabs.find(
      (t) => t.type === 'diff' && t.diffData?.base === base && t.diffData?.file === file
    );
    if (existingDiffTab) {
      setActiveTabId(existingDiffTab.id);
      return;
    }

    // Create new diff tab as preview (replaces previous unpinned diff tab)
    const newTab: Tab = {
      id: generateTabId(),
      path: diffId, // Used for display purposes
      isPreview: true,
      isPinned: false,
      type: 'diff',
      diffData: { base, file, head },
    };

    setTabs((prevTabs) => {
      // Find an existing unpinned diff tab to replace
      const existingPreviewDiffIndex = prevTabs.findIndex(
        (t) => t.type === 'diff' && !t.isPinned
      );
      if (existingPreviewDiffIndex >= 0) {
        const newTabs = [...prevTabs];
        newTabs[existingPreviewDiffIndex] = newTab;
        return newTabs;
      }
      return [...prevTabs, newTab];
    });
    setActiveTabId(newTab.id);
  }, []);

  const openConversationTab = useCallback((path: string, data: ConversationData) => {
    const currentTabs = tabsRef.current;

    // Check if this conversation is already open (by sessionId)
    const existingConversationTab = currentTabs.find(
      (t) => t.type === 'conversation' && t.conversationData?.sessionId === data.sessionId
    );
    if (existingConversationTab) {
      setActiveTabId(existingConversationTab.id);
      return;
    }

    // Create new conversation tab (preview mode, can be pinned later)
    const newTab: Tab = {
      id: generateTabId(),
      path,
      isPreview: true,
      isPinned: false,
      type: 'conversation',
      conversationData: data,
      metadata: { subagentConversation: true },
    };

    setTabs((prevTabs) => [...prevTabs, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const openViewTab = useCallback((viewType: ViewTabType): string => {
    const currentTabs = tabsRef.current;
    const existing = currentTabs.find((t) => t.type === viewType);
    if (existing) {
      setActiveTabId(existing.id);
      return existing.id;
    }

    const newTab: Tab = {
      id: generateTabId(),
      path: VIEW_TAB_PATHS[viewType],
      isPreview: false,
      isPinned: true,
      type: viewType,
    };
    setTabs((prevTabs) => [...prevTabs, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
  }, []);

  const closeViewTab = useCallback((viewType: ViewTabType) => {
    setTabs((prevTabs) => {
      const tab = prevTabs.find((t) => t.type === viewType);
      if (!tab) return prevTabs;

      const tabIndex = prevTabs.findIndex((t) => t.id === tab.id);
      const newTabs = prevTabs.filter((t) => t.id !== tab.id);

      setActiveTabId((currentActiveId) => {
        if (currentActiveId !== tab.id) return currentActiveId;
        if (newTabs.length === 0) return null;
        const nextIndex = Math.min(tabIndex, newTabs.length - 1);
        return newTabs[nextIndex].id;
      });

      return newTabs;
    });
  }, []);

  const closeConversationTab = useCallback((sessionId: string) => {
    setTabs((prevTabs) => {
      const tabToClose = prevTabs.find(
        (t) => t.type === 'conversation' && t.conversationData?.sessionId === sessionId
      );
      if (!tabToClose) return prevTabs;

      // Only auto-close if autoClose is enabled
      if (!tabToClose.conversationData?.autoClose) return prevTabs;

      const tabIndex = prevTabs.findIndex((t) => t.id === tabToClose.id);
      const newTabs = prevTabs.filter((t) => t.id !== tabToClose.id);

      // Update active tab if we're closing the active one
      setActiveTabId((currentActiveId) => {
        if (currentActiveId !== tabToClose.id) return currentActiveId;
        if (newTabs.length === 0) return null;

        // Prefer the tab to the right, then to the left
        const nextIndex = Math.min(tabIndex, newTabs.length - 1);
        return newTabs[nextIndex].id;
      });

      return newTabs;
    });
  }, []);

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    openDiffTab,
    openConversationTab,
    closeConversationTab,
    openViewTab,
    closeViewTab,
    pinTab,
    unpinTab,
    closeTab,
    closeTabsWithMetadata,
    setActiveTab,
  };
}
