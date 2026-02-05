import { useState, useCallback, useEffect, useRef } from 'react';

// Right pane content types (chat is now a separate third panel)
export type RightPaneContent =
  | { type: 'file'; path: string }
  | { type: 'git-graph' }
  | { type: 'working-tree' }
  | { type: 'diff'; base: string; head?: string; file?: string }
  | { type: 'commit'; hash: string };

interface SplitViewState {
  isSplit: boolean;
  splitRatio: number;
  rightPaneContent: RightPaneContent | null;
}

interface UseSplitViewOptions {
  initialState?: Partial<SplitViewState>;
  onStateChange?: (state: SplitViewState) => void;
}

interface UseSplitViewResult {
  isSplit: boolean;
  splitRatio: number;
  leftFile: string | null;
  rightPaneContent: RightPaneContent | null;
  // Convenience getter for backward compatibility
  rightFile: string | null;
  toggleSplit: () => void;
  setSplitRatio: (ratio: number) => void;
  setLeftFile: (path: string | null) => void;
  // Legacy setter (still works for files)
  setRightFile: (path: string | null) => void;
  // New helper functions for setting different content types
  setRightPaneFile: (path: string) => void;
  setRightPaneGitGraph: () => void;
  setRightPaneWorkingTree: () => void;
  setRightPaneDiff: (base: string, head?: string, file?: string) => void;
  setRightPaneCommit: (hash: string) => void;
  clearRightPane: () => void;
}

export function useSplitView(options: UseSplitViewOptions = {}): UseSplitViewResult {
  const { initialState, onStateChange } = options;

  const [isSplit, setIsSplit] = useState(initialState?.isSplit ?? false);
  const [splitRatio, setSplitRatioState] = useState(initialState?.splitRatio ?? 0.5);
  const [leftFile, setLeftFile] = useState<string | null>(null);
  const [rightPaneContent, setRightPaneContentState] = useState<RightPaneContent | null>(
    initialState?.rightPaneContent ?? null
  );

  // Track if this is the initial mount to avoid triggering onStateChange
  const isInitialMount = useRef(true);

  // Use ref to avoid re-running effect when callback changes
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  // Notify parent of state changes (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onStateChangeRef.current?.({ isSplit, splitRatio, rightPaneContent });
  }, [isSplit, splitRatio, rightPaneContent]);

  const toggleSplit = useCallback(() => {
    setIsSplit((prev) => !prev);
  }, []);

  const setSplitRatio = useCallback((ratio: number) => {
    // Clamp ratio between 0.2 and 0.8 for usability
    const clampedRatio = Math.max(0.2, Math.min(0.8, ratio));
    setSplitRatioState(clampedRatio);
  }, []);

  // Legacy setter for backward compatibility - sets file content type
  const setRightFile = useCallback((path: string | null) => {
    if (path === null) {
      setRightPaneContentState(null);
    } else {
      setRightPaneContentState({ type: 'file', path });
    }
  }, []);

  // New helper functions
  const setRightPaneFile = useCallback((path: string) => {
    setRightPaneContentState({ type: 'file', path });
  }, []);

  const setRightPaneGitGraph = useCallback(() => {
    setRightPaneContentState({ type: 'git-graph' });
  }, []);

  const setRightPaneWorkingTree = useCallback(() => {
    setRightPaneContentState({ type: 'working-tree' });
  }, []);

  const setRightPaneDiff = useCallback((base: string, head?: string, file?: string) => {
    setRightPaneContentState({ type: 'diff', base, head, file });
  }, []);

  const setRightPaneCommit = useCallback((hash: string) => {
    setRightPaneContentState({ type: 'commit', hash });
  }, []);

  const clearRightPane = useCallback(() => {
    setRightPaneContentState(null);
  }, []);

  // Convenience getter for backward compatibility
  const rightFile = rightPaneContent?.type === 'file' ? rightPaneContent.path : null;

  return {
    isSplit,
    splitRatio,
    leftFile,
    rightPaneContent,
    rightFile,
    toggleSplit,
    setSplitRatio,
    setLeftFile,
    setRightFile,
    setRightPaneFile,
    setRightPaneGitGraph,
    setRightPaneWorkingTree,
    setRightPaneDiff,
    setRightPaneCommit,
    clearRightPane,
  };
}
