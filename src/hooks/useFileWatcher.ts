import { useState, useEffect, useRef } from 'react';
import { isTauri } from '../utils/platform';

interface UseFileWatcherOptions {
  path: string | null;
  streamingTimeout?: number;
}

export function useFileWatcher({ path, streamingTimeout = 1500 }: UseFileWatcherOptions) {
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChangeRef = useRef<number>(0);
  const isTauriEnv = isTauri();

  useEffect(() => {
    if (!isTauriEnv || !path) {
      setContent('');
      setLoading(false);
      setError(null);
      setIsStreaming(false);
      return;
    }

    let mounted = true;
    let unwatch: (() => void) | undefined;

    const loadFile = async () => {
      if (!mounted) return;

      setLoading(true);
      setError(null);

      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const text = await readTextFile(path);
        if (mounted) {
          setContent(text);
        }
      } catch (err) {
        if (mounted) {
          setError(`Failed to read file: ${err}`);
          setContent('');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const setupWatcher = async () => {
      try {
        // Initial load
        await loadFile();

        const { watchImmediate } = await import('@tauri-apps/plugin-fs');
        unwatch = await watchImmediate(path, async (event) => {
          if (!mounted) return;

          const eventType = event.type;
          const isModify = typeof eventType === 'object' && 'modify' in eventType;
          const isCreate = typeof eventType === 'object' && 'create' in eventType;

          if (isModify || isCreate) {
            const now = Date.now();
            const timeSinceLastChange = now - lastChangeRef.current;
            lastChangeRef.current = now;

            if (timeSinceLastChange < streamingTimeout) {
              setIsStreaming(true);
            }

            if (streamingTimerRef.current) {
              clearTimeout(streamingTimerRef.current);
            }

            streamingTimerRef.current = setTimeout(() => {
              if (mounted) {
                setIsStreaming(false);
              }
            }, streamingTimeout);

            await loadFile();
          }
        });
      } catch (err) {
        console.error('Failed to setup file watcher:', err);
        if (mounted) {
          setError(`Failed to watch file: ${err}`);
        }
      }
    };

    setupWatcher();

    return () => {
      mounted = false;
      unwatch?.();
      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current);
      }
    };
  }, [path, streamingTimeout, isTauriEnv]);

  const reload = async () => {
    if (!isTauriEnv || !path) return;

    setLoading(true);
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const text = await readTextFile(path);
      setContent(text);
    } catch (err) {
      setError(`Failed to read file: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return { content, error, loading, isStreaming, reload };
}
