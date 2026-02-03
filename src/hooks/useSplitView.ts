import { useState, useCallback } from 'react';

interface UseSplitViewResult {
  isSplit: boolean;
  splitRatio: number;
  leftFile: string | null;
  rightFile: string | null;
  toggleSplit: () => void;
  setSplitRatio: (ratio: number) => void;
  setLeftFile: (path: string | null) => void;
  setRightFile: (path: string | null) => void;
}

export function useSplitView(): UseSplitViewResult {
  const [isSplit, setIsSplit] = useState(false);
  const [splitRatio, setSplitRatioState] = useState(0.5);
  const [leftFile, setLeftFile] = useState<string | null>(null);
  const [rightFile, setRightFile] = useState<string | null>(null);

  const toggleSplit = useCallback(() => {
    setIsSplit((prev) => !prev);
  }, []);

  const setSplitRatio = useCallback((ratio: number) => {
    // Clamp ratio between 0.2 and 0.8 for usability
    const clampedRatio = Math.max(0.2, Math.min(0.8, ratio));
    setSplitRatioState(clampedRatio);
  }, []);

  return {
    isSplit,
    splitRatio,
    leftFile,
    rightFile,
    toggleSplit,
    setSplitRatio,
    setLeftFile,
    setRightFile,
  };
}
