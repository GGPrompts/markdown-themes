import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Tab } from '../hooks/useTabManager';
import type { RightPaneContent } from '../hooks/useSplitView';

const STORAGE_KEY = 'markdown-themes-page-state';

interface FilesPageState {
  tabs: Tab[];
  activeTabId: string | null;
  isSplit: boolean;
  splitRatio: number;
  rightPaneContent: RightPaneContent | null;
}

interface PromptsPageState {
  currentFile: string | null;
  showLibrary: boolean;
}

interface SourceControlPageState {
  expandedRepos: string[];
  searchQuery: string;
}

interface PageState {
  files: FilesPageState;
  prompts: PromptsPageState;
  sourceControl: SourceControlPageState;
}

interface PageStateContextValue {
  // Files page state
  filesState: FilesPageState;
  setFilesState: (state: Partial<FilesPageState>) => void;

  // Prompts page state
  promptsState: PromptsPageState;
  setPromptsState: (state: Partial<PromptsPageState>) => void;

  // SourceControl page state
  sourceControlState: SourceControlPageState;
  setSourceControlState: (state: Partial<SourceControlPageState>) => void;
}

const defaultState: PageState = {
  files: {
    tabs: [],
    activeTabId: null,
    isSplit: false,
    splitRatio: 0.5,
    rightPaneContent: null,
  },
  prompts: {
    currentFile: null,
    showLibrary: true,
  },
  sourceControl: {
    expandedRepos: [],
    searchQuery: '',
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
      },
      prompts: {
        currentFile: parsed.prompts?.currentFile ?? defaultState.prompts.currentFile,
        showLibrary: parsed.prompts?.showLibrary ?? defaultState.prompts.showLibrary,
      },
      sourceControl: {
        expandedRepos: parsed.sourceControl?.expandedRepos ?? defaultState.sourceControl.expandedRepos,
        searchQuery: parsed.sourceControl?.searchQuery ?? defaultState.sourceControl.searchQuery,
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

  const setPromptsState = useCallback((partial: Partial<PromptsPageState>) => {
    setState((prev) => {
      const next = {
        ...prev,
        prompts: { ...prev.prompts, ...partial },
      };
      savePageState(next);
      return next;
    });
  }, []);

  const setSourceControlState = useCallback((partial: Partial<SourceControlPageState>) => {
    setState((prev) => {
      const next = {
        ...prev,
        sourceControl: { ...prev.sourceControl, ...partial },
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
        promptsState: state.prompts,
        setPromptsState,
        sourceControlState: state.sourceControl,
        setSourceControlState,
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
