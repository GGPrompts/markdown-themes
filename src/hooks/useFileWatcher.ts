import { useState, useEffect, useCallback, useRef } from 'react';
import { isTauri } from '../utils/platform';

interface UseFileWatcherOptions {
  path: string | null;
  streamingTimeout?: number; // ms to wait before considering streaming stopped
}

export function useFileWatcher({ path, streamingTimeout = 1500 }: UseFileWatcherOptions) {
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChangeRef = useRef<number>(0);
  const isTauriEnv = isTauri();

  const loadFile = useCallback(async () => {
    if (!path || !isTauriEnv) {
      setContent('');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const text = await readTextFile(path);
      setContent(text);
    } catch (err) {
      setError(`Failed to read file: ${err}`);
      setContent('');
    } finally {
      setLoading(false);
    }
  }, [path, isTauriEnv]);

  useEffect(() => {
    if (!isTauriEnv || !path) {
      setContent('');
      setLoading(false);
      setError(null);
      return;
    }

    loadFile();

    let unwatch: (() => void) | undefined;

    const setupWatcher = async () => {
      try {
        const { watchImmediate } = await import('@tauri-apps/plugin-fs');
        unwatch = await watchImmediate(path, (event) => {
          const eventType = event.type;
          const isModify = typeof eventType === 'object' && 'modify' in eventType;
          const isCreate = typeof eventType === 'object' && 'create' in eventType;
          if (isModify || isCreate) {
            const now = Date.now();
            const timeSinceLastChange = now - lastChangeRef.current;
            lastChangeRef.current = now;

            // If changes are happening rapidly, we're streaming
            if (timeSinceLastChange < streamingTimeout) {
              setIsStreaming(true);
            }

            // Clear existing timer
            if (streamingTimerRef.current) {
              clearTimeout(streamingTimerRef.current);
            }

            // Set timer to stop streaming state after timeout
            streamingTimerRef.current = setTimeout(() => {
              setIsStreaming(false);
            }, streamingTimeout);

            loadFile();
          }
        });
      } catch (err) {
        console.error('Failed to watch file:', err);
      }
    };

    setupWatcher();

    return () => {
      unwatch?.();
      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current);
      }
    };
  }, [path, loadFile, streamingTimeout, isTauriEnv]);

  return { content, error, loading, isStreaming, reload: loadFile };
}
