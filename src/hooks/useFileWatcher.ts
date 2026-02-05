import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createWebSocket,
  clearAuthToken,
  type FileWatcherMessage,
} from '../lib/api';

interface UseFileWatcherOptions {
  path: string | null;
  streamingTimeout?: number;
}

interface UseFileWatcherResult {
  content: string;
  error: string | null;
  loading: boolean;
  isStreaming: boolean;
  reload: () => void;
  connected: boolean;
}

// Known message types that are not file-watcher messages (silently ignore)
const IGNORED_MESSAGE_TYPES = new Set(['memory-stats', 'pong', 'connected']);

// Type guard for FileWatcherMessage
function isFileWatcherMessage(data: unknown): data is FileWatcherMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return ['file-content', 'file-change', 'file-deleted', 'file-watch-error'].includes(msg.type as string);
}

// Check if message should be silently ignored
function shouldIgnoreMessage(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return IGNORED_MESSAGE_TYPES.has(msg.type as string);
}

export function useFileWatcher({
  path,
  streamingTimeout = 1500,
}: UseFileWatcherOptions): UseFileWatcherResult {
  const [content, setContent] = useState<string>('');
  const [contentPath, setContentPath] = useState<string | null>(null); // Track which path content belongs to
  const [error, setError] = useState<string | null>(null);
  const [pendingLoad, setPendingLoad] = useState(false); // True while waiting for WebSocket response
  const [isStreaming, setIsStreaming] = useState(false);
  const [connected, setConnected] = useState(false);

  // Derive loading: true if we're pending OR if content doesn't match requested path
  const loading = pendingLoad || (path !== null && contentPath !== path);

  const wsRef = useRef<WebSocket | null>(null);
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const currentPathRef = useRef<string | null>(null);
  const maxReconnectAttempts = 5;
  const mountedRef = useRef(true);

  // Clean up streaming timer
  const clearStreamingTimer = useCallback(() => {
    if (streamingTimerRef.current) {
      clearTimeout(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
  }, []);

  // Subscribe to a file path on the existing connection
  const subscribeTo = useCallback((ws: WebSocket, filePath: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'file-watch',
          path: filePath,
        })
      );
    }
  }, []);

  // Unsubscribe from a file path
  const unsubscribeFrom = useCallback((ws: WebSocket, filePath: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'file-unwatch',
          path: filePath,
        })
      );
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!mountedRef.current) return;

      try {
        const parsed = JSON.parse(event.data);
        // Silently ignore known non-file-watcher messages
        if (shouldIgnoreMessage(parsed)) {
          return;
        }
        if (!isFileWatcherMessage(parsed)) {
          console.warn('[useFileWatcher] Unknown message type:', parsed);
          return;
        }
        const message = parsed;

        // Ignore messages for paths we're no longer watching
        // This prevents stale messages from overwriting content after tab switch
        if (message.path && message.path !== currentPathRef.current) {
          return;
        }

        switch (message.type) {
          case 'file-content':
            // Initial file content
            setContent(message.content);
            setContentPath(currentPathRef.current);
            setPendingLoad(false);
            setError(null);
            break;

          case 'file-change':
            // File was modified
            setContent(message.content);
            setContentPath(currentPathRef.current);
            setError(null);

            // Detect streaming based on time between changes
            if (message.timeSinceLastChange < streamingTimeout) {
              setIsStreaming(true);
            }

            // Reset streaming state after timeout
            clearStreamingTimer();
            streamingTimerRef.current = setTimeout(() => {
              if (mountedRef.current) {
                setIsStreaming(false);
              }
            }, streamingTimeout);
            break;

          case 'file-deleted':
            setContent('');
            setContentPath(currentPathRef.current);
            setError('File was deleted');
            setIsStreaming(false);
            clearStreamingTimer();
            break;

          case 'file-watch-error':
            setError(message.error);
            setContentPath(currentPathRef.current); // Mark as "loaded" even on error
            setPendingLoad(false);
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    },
    [streamingTimeout, clearStreamingTimer]
  );

  // Connect to WebSocket (only called once, maintains connection)
  const connect = useCallback(async (initialPath: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Already connected, just subscribe to new path
      subscribeTo(wsRef.current, initialPath);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      // Connection in progress, wait for it
      return;
    }

    setPendingLoad(true);
    setError(null);

    try {
      const ws = await createWebSocket();
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }

        setConnected(true);
        reconnectAttemptRef.current = 0;

        // Subscribe to file watching
        if (currentPathRef.current) {
          subscribeTo(ws, currentPathRef.current);
        }
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        if (!mountedRef.current) return;

        wsRef.current = null;
        setConnected(false);

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptRef.current < maxReconnectAttempts && currentPathRef.current) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
          reconnectAttemptRef.current++;

          setTimeout(() => {
            if (mountedRef.current && currentPathRef.current) {
              connect(currentPathRef.current);
            }
          }, delay);
        } else if (reconnectAttemptRef.current >= maxReconnectAttempts) {
          setError('Lost connection to backend. Please ensure the backend is running on port 8130.');
          setPendingLoad(false);
        }
      };

      ws.onerror = (err) => {
        console.error('[useFileWatcher] WebSocket error:', err);
        // Error handling is done in onclose
        // Clear cached token in case it expired
        clearAuthToken();
      };
    } catch (err) {
      if (!mountedRef.current) return;

      setError(
        `Failed to connect to backend: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setPendingLoad(false);
      setConnected(false);

      // Clear token and retry
      clearAuthToken();

      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
        reconnectAttemptRef.current++;

        setTimeout(() => {
          if (mountedRef.current && currentPathRef.current) {
            connect(currentPathRef.current);
          }
        }, delay);
      }
    }
  }, [handleMessage, subscribeTo]);

  // Disconnect and cleanup (only on unmount or explicit close)
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN && currentPathRef.current) {
        unsubscribeFrom(wsRef.current, currentPathRef.current);
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    clearStreamingTimer();
  }, [clearStreamingTimer, unsubscribeFrom]);

  // Reload file content
  const reload = useCallback(() => {
    if (!currentPathRef.current) return;

    const filePath = currentPathRef.current;
    setContent('');
    setContentPath(null); // Clear to trigger loading state
    setPendingLoad(true);
    setError(null);

    // Unsubscribe and resubscribe to get fresh content
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      unsubscribeFrom(wsRef.current, filePath);
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          subscribeTo(wsRef.current, filePath);
        }
      }, 50);
    } else {
      // Need to reconnect
      reconnectAttemptRef.current = 0;
      connect(filePath);
    }
  }, [connect, subscribeTo, unsubscribeFrom]);

  // Effect: Handle path changes - switch subscription without reconnecting
  useEffect(() => {
    const previousPath = currentPathRef.current;
    currentPathRef.current = path;
    mountedRef.current = true;

    if (!path) {
      // No path, reset state and unsubscribe
      if (previousPath && wsRef.current?.readyState === WebSocket.OPEN) {
        unsubscribeFrom(wsRef.current, previousPath);
      }
      setContent('');
      setContentPath(null);
      setPendingLoad(false);
      setError(null);
      setIsStreaming(false);
      return;
    }

    // If we have a connection, switch subscription
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (previousPath && previousPath !== path) {
        unsubscribeFrom(wsRef.current, previousPath);
      }
      setPendingLoad(true);
      setContent('');
      setError(null);
      subscribeTo(wsRef.current, path);
    } else {
      // Need to establish connection
      reconnectAttemptRef.current = 0;
      connect(path);
    }

    return () => {
      // Only fully disconnect on unmount, not on path change
    };
  }, [path, connect, subscribeTo, unsubscribeFrom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    content,
    error,
    loading,
    isStreaming,
    reload,
    connected,
  };
}
