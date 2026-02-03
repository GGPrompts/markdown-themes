import { useState, useEffect, useCallback, useRef } from 'react';
import { readTextFile, watchImmediate } from '@tauri-apps/plugin-fs';

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

  const loadFile = useCallback(async () => {
    if (!path) {
      setContent('');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const text = await readTextFile(path);
      setContent(text);
    } catch (err) {
      setError(`Failed to read file: ${err}`);
      setContent('');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    loadFile();

    if (!path) return;

    let unwatch: (() => void) | undefined;

    const setupWatcher = async () => {
      try {
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
  }, [path, loadFile, streamingTimeout]);

  return { content, error, loading, isStreaming, reload: loadFile };
}
