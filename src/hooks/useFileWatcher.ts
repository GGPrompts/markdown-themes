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

export function useFileWatcher({
  path,
  streamingTimeout = 1500,
}: UseFileWatcherOptions): UseFileWatcherResult {
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connected, setConnected] = useState(false);

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
        const message = JSON.parse(event.data) as FileWatcherMessage;

        switch (message.type) {
          case 'file-content':
            // Initial file content
            setContent(message.content);
            setLoading(false);
            setError(null);
            break;

          case 'file-change':
            // File was modified
            setContent(message.content);
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
            setError('File was deleted');
            setIsStreaming(false);
            clearStreamingTimer();
            break;

          case 'file-watch-error':
            setError(message.error);
            setLoading(false);
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

    setLoading(true);
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
          setError('Lost connection to TabzChrome. Please ensure the backend is running.');
          setLoading(false);
        }
      };

      ws.onerror = () => {
        // Error handling is done in onclose
        // Clear cached token in case it expired
        clearAuthToken();
      };
    } catch (err) {
      if (!mountedRef.current) return;

      setError(
        `Failed to connect to TabzChrome: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setLoading(false);
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
    setLoading(true);
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
      setLoading(false);
      setError(null);
      setIsStreaming(false);
      return;
    }

    // If we have a connection, switch subscription
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (previousPath && previousPath !== path) {
        unsubscribeFrom(wsRef.current, previousPath);
      }
      setLoading(true);
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
