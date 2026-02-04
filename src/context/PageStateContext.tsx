import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Tab } from '../hooks/useTabManager';
import type { RightPaneContent } from '../hooks/useSplitView';

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

const PageStateContext = createContext<PageStateContextValue | null>(null);

export function PageStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PageState>(defaultState);

  const setFilesState = useCallback((partial: Partial<FilesPageState>) => {
    setState((prev) => ({
      ...prev,
      files: { ...prev.files, ...partial },
    }));
  }, []);

  const setPromptsState = useCallback((partial: Partial<PromptsPageState>) => {
    setState((prev) => ({
      ...prev,
      prompts: { ...prev.prompts, ...partial },
    }));
  }, []);

  const setSourceControlState = useCallback((partial: Partial<SourceControlPageState>) => {
    setState((prev) => ({
      ...prev,
      sourceControl: { ...prev.sourceControl, ...partial },
    }));
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
