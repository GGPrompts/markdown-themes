import { useState, useEffect, useCallback } from 'react';
import type { ThemeId } from '../themes';

const MAX_RECENT_FILES = 10;
const STORAGE_KEY = 'markdown-themes-settings';

export interface AppState {
  theme: ThemeId;
  recentFiles: string[];
  lastWorkspace?: string;
}

const DEFAULT_STATE: AppState = {
  theme: 'dark-academia',
  recentFiles: [],
  lastWorkspace: undefined,
};

interface UseAppStoreResult {
  state: AppState;
  isLoading: boolean;
  saveTheme: (theme: ThemeId) => void;
  addRecentFile: (filePath: string) => void;
  saveLastWorkspace: (workspacePath: string | null) => void;
  clearRecentFiles: () => void;
}

function loadFromStorage(): AppState {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return DEFAULT_STATE;

    const parsed = JSON.parse(data);
    return {
      theme: parsed.theme ?? DEFAULT_STATE.theme,
      recentFiles: parsed.recentFiles ?? DEFAULT_STATE.recentFiles,
      lastWorkspace: parsed.lastWorkspace ?? DEFAULT_STATE.lastWorkspace,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

export function useAppStore(): UseAppStoreResult {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);

  // Load state from localStorage on mount
  useEffect(() => {
    const loaded = loadFromStorage();
    setState(loaded);
    setIsLoading(false);
  }, []);

  const saveTheme = useCallback((theme: ThemeId) => {
    setState((prev) => {
      const next = { ...prev, theme };
      saveToStorage(next);
      return next;
    });
  }, []);

  const addRecentFile = useCallback((filePath: string) => {
    setState((prev) => {
      // Remove if already exists, add to front
      const filtered = prev.recentFiles.filter((f) => f !== filePath);
      const newRecentFiles = [filePath, ...filtered].slice(0, MAX_RECENT_FILES);

      const next = { ...prev, recentFiles: newRecentFiles };
      saveToStorage(next);
      return next;
    });
  }, []);

  const saveLastWorkspace = useCallback((workspacePath: string | null) => {
    setState((prev) => {
      const next = { ...prev, lastWorkspace: workspacePath ?? undefined };
      saveToStorage(next);
      return next;
    });
  }, []);

  const clearRecentFiles = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, recentFiles: [] };
      saveToStorage(next);
      return next;
    });
  }, []);

  return {
    state,
    isLoading,
    saveTheme,
    addRecentFile,
    saveLastWorkspace,
    clearRecentFiles,
  };
}
