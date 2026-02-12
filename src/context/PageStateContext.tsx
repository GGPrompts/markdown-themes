import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Tab } from '../hooks/useTabManager';
import type { RightPaneContent } from '../hooks/useSplitView';
import type { TerminalTab } from '../hooks/useTerminal';

const STORAGE_KEY = 'markdown-themes-page-state';

interface RightPaneTab {
  id: string;
  path: string;
  isPreview: boolean;
  isPinned: boolean;
}

interface FilesPageState {
  tabs: Tab[];
  activeTabId: string | null;
  isSplit: boolean;
  splitRatio: number;
  rightPaneContent: RightPaneContent | null;
  rightPaneTabs: RightPaneTab[];
  rightActiveTabId: string | null;
  // Third column state (switchable between chat and terminal)
  thirdColumnMode: 'chat' | 'terminal';
  thirdColumnOpen: boolean;
  thirdColumnWidth: number;
  // Chat tab state (multi-conversation tabs)
  chatTabs: string[];
  activeChatTabId: string | null;
  // Terminal tab state
  terminalTabs: TerminalTab[];
  activeTerminalTabId: string | null;
}

export type { RightPaneTab };

interface PageState {
  files: FilesPageState;
}

interface PageStateContextValue {
  // Files page state
  filesState: FilesPageState;
  setFilesState: (state: Partial<FilesPageState>) => void;
}

const defaultState: PageState = {
  files: {
    tabs: [],
    activeTabId: null,
    isSplit: false,
    splitRatio: 0.5,
    rightPaneContent: null,
    rightPaneTabs: [],
    rightActiveTabId: null,
    thirdColumnMode: 'terminal',
    thirdColumnOpen: false,
    thirdColumnWidth: 480,
    chatTabs: [],
    activeChatTabId: null,
    terminalTabs: [],
    activeTerminalTabId: null,
  },
};

function loadPageState(): PageState {
  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    if (!data) return defaultState;

    const parsed = JSON.parse(data);
    return {
      files: {
        tabs: parsed.files?.tabs ?? defaultState.files.tabs,
        activeTabId: parsed.files?.activeTabId ?? defaultState.files.activeTabId,
        isSplit: parsed.files?.isSplit ?? defaultState.files.isSplit,
        splitRatio: parsed.files?.splitRatio ?? defaultState.files.splitRatio,
        rightPaneContent: parsed.files?.rightPaneContent ?? defaultState.files.rightPaneContent,
        rightPaneTabs: parsed.files?.rightPaneTabs ?? defaultState.files.rightPaneTabs,
        rightActiveTabId: parsed.files?.rightActiveTabId ?? defaultState.files.rightActiveTabId,
        thirdColumnMode: parsed.files?.thirdColumnMode ?? defaultState.files.thirdColumnMode,
        thirdColumnOpen: parsed.files?.thirdColumnOpen ?? defaultState.files.thirdColumnOpen,
        thirdColumnWidth: parsed.files?.thirdColumnWidth ?? defaultState.files.thirdColumnWidth,
        chatTabs: parsed.files?.chatTabs ?? defaultState.files.chatTabs,
        activeChatTabId: parsed.files?.activeChatTabId ?? defaultState.files.activeChatTabId,
        terminalTabs: parsed.files?.terminalTabs ?? defaultState.files.terminalTabs,
        activeTerminalTabId: parsed.files?.activeTerminalTabId ?? defaultState.files.activeTerminalTabId,
      },
    };
  } catch {
    return defaultState;
  }
}

function savePageState(state: PageState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save to sessionStorage:', err);
  }
}

const PageStateContext = createContext<PageStateContextValue | null>(null);

export function PageStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PageState>(defaultState);

  // Load state from sessionStorage on mount
  useEffect(() => {
    const loaded = loadPageState();
    setState(loaded);
  }, []);

  const setFilesState = useCallback((partial: Partial<FilesPageState>) => {
    setState((prev) => {
      const next = {
        ...prev,
        files: { ...prev.files, ...partial },
      };
      savePageState(next);
      return next;
    });
  }, []);

  return (
    <PageStateContext.Provider
      value={{
        filesState: state.files,
        setFilesState,
      }}
    >
      {children}
    </PageStateContext.Provider>
  );
}

export function usePageState(): PageStateContextValue {
  const context = useContext(PageStateContext);
  if (!context) {
    throw new Error('usePageState must be used within a PageStateProvider');
  }
  return context;
}
