import { useState, useEffect, useCallback, useRef } from 'react';
import type { ThemeId } from '../themes';
import { isTauri, browserStoreGet, browserStoreSet, browserStoreDelete } from '../utils/platform';

const MAX_RECENT_FILES = 10;
const STORE_FILE = 'app-settings.json';

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
  saveTheme: (theme: ThemeId) => Promise<void>;
  addRecentFile: (filePath: string) => Promise<void>;
  saveLastWorkspace: (workspacePath: string | null) => Promise<void>;
  clearRecentFiles: () => Promise<void>;
}

export function useAppStore(): UseAppStoreResult {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const storeRef = useRef<unknown>(null);
  const isTauriEnv = isTauri();

  // Initialize store and load state
  useEffect(() => {
    let mounted = true;

    async function initStore() {
      try {
        if (isTauriEnv) {
          // Use Tauri store
          const { LazyStore } = await import('@tauri-apps/plugin-store');
          const store = new LazyStore(STORE_FILE);
          storeRef.current = store;

          const [savedTheme, savedRecentFiles, savedLastWorkspace] = await Promise.all([
            store.get<ThemeId>('theme'),
            store.get<string[]>('recentFiles'),
            store.get<string>('lastWorkspace'),
          ]);

          if (mounted) {
            setState({
              theme: savedTheme ?? DEFAULT_STATE.theme,
              recentFiles: savedRecentFiles ?? DEFAULT_STATE.recentFiles,
              lastWorkspace: savedLastWorkspace ?? DEFAULT_STATE.lastWorkspace,
            });
          }
        } else {
          // Use browser localStorage
          const savedTheme = browserStoreGet<ThemeId>('theme');
          const savedRecentFiles = browserStoreGet<string[]>('recentFiles');
          const savedLastWorkspace = browserStoreGet<string>('lastWorkspace');

          if (mounted) {
            setState({
              theme: savedTheme ?? DEFAULT_STATE.theme,
              recentFiles: savedRecentFiles ?? DEFAULT_STATE.recentFiles,
              lastWorkspace: savedLastWorkspace ?? DEFAULT_STATE.lastWorkspace,
            });
          }
        }

        if (mounted) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to initialize app store:', err);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initStore();

    return () => {
      mounted = false;
    };
  }, [isTauriEnv]);

  const saveTheme = useCallback(async (theme: ThemeId) => {
    try {
      if (isTauriEnv && storeRef.current) {
        const store = storeRef.current as { set: (key: string, value: unknown) => Promise<void> };
        await store.set('theme', theme);
      } else {
        browserStoreSet('theme', theme);
      }
      setState(prev => ({ ...prev, theme }));
    } catch (err) {
      console.error('Failed to save theme:', err);
    }
  }, [isTauriEnv]);

  const addRecentFile = useCallback(async (filePath: string) => {
    try {
      let currentFiles: string[] = [];

      if (isTauriEnv && storeRef.current) {
        const store = storeRef.current as { get: <T>(key: string) => Promise<T | null>; set: (key: string, value: unknown) => Promise<void> };
        currentFiles = (await store.get<string[]>('recentFiles')) ?? [];
      } else {
        currentFiles = browserStoreGet<string[]>('recentFiles') ?? [];
      }

      const filteredFiles = currentFiles.filter(f => f !== filePath);
      const newRecentFiles = [filePath, ...filteredFiles].slice(0, MAX_RECENT_FILES);

      if (isTauriEnv && storeRef.current) {
        const store = storeRef.current as { set: (key: string, value: unknown) => Promise<void> };
        await store.set('recentFiles', newRecentFiles);
      } else {
        browserStoreSet('recentFiles', newRecentFiles);
      }

      setState(prev => ({ ...prev, recentFiles: newRecentFiles }));
    } catch (err) {
      console.error('Failed to add recent file:', err);
    }
  }, [isTauriEnv]);

  const saveLastWorkspace = useCallback(async (workspacePath: string | null) => {
    try {
      if (isTauriEnv && storeRef.current) {
        const store = storeRef.current as { set: (key: string, value: unknown) => Promise<void>; delete: (key: string) => Promise<void> };
        if (workspacePath) {
          await store.set('lastWorkspace', workspacePath);
        } else {
          await store.delete('lastWorkspace');
        }
      } else {
        if (workspacePath) {
          browserStoreSet('lastWorkspace', workspacePath);
        } else {
          browserStoreDelete('lastWorkspace');
        }
      }
      setState(prev => ({ ...prev, lastWorkspace: workspacePath ?? undefined }));
    } catch (err) {
      console.error('Failed to save last workspace:', err);
    }
  }, [isTauriEnv]);

  const clearRecentFiles = useCallback(async () => {
    try {
      if (isTauriEnv && storeRef.current) {
        const store = storeRef.current as { set: (key: string, value: unknown) => Promise<void> };
        await store.set('recentFiles', []);
      } else {
        browserStoreSet('recentFiles', []);
      }
      setState(prev => ({ ...prev, recentFiles: [] }));
    } catch (err) {
      console.error('Failed to clear recent files:', err);
    }
  }, [isTauriEnv]);

  return {
    state,
    isLoading,
    saveTheme,
    addRecentFile,
    saveLastWorkspace,
    clearRecentFiles,
  };
}
