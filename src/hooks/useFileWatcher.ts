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
  const maxReconnectAttempts = 5;
  const mountedRef = useRef(true);

  // Clean up streaming timer
  const clearStreamingTimer = useCallback(() => {
    if (streamingTimerRef.current) {
      clearTimeout(streamingTimerRef.current);
      streamingTimerRef.current = null;
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

  // Connect to WebSocket and subscribe to file
  const connect = useCallback(async () => {
    if (!path || wsRef.current?.readyState === WebSocket.OPEN) {
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
        ws.send(
          JSON.stringify({
            type: 'file-watch',
            path: path,
          })
        );
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        if (!mountedRef.current) return;

        setConnected(false);
        wsRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
          reconnectAttemptRef.current++;

          setTimeout(() => {
            if (mountedRef.current && path) {
              connect();
            }
          }, delay);
        } else {
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
          if (mountedRef.current && path) {
            connect();
          }
        }, delay);
      }
    }
  }, [path, handleMessage]);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      // Unsubscribe before closing
      if (wsRef.current.readyState === WebSocket.OPEN && path) {
        wsRef.current.send(
          JSON.stringify({
            type: 'file-unwatch',
            path: path,
          })
        );
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    clearStreamingTimer();
  }, [path, clearStreamingTimer]);

  // Reload file content
  const reload = useCallback(() => {
    if (!path) return;

    // Disconnect and reconnect to get fresh content
    disconnect();
    setContent('');
    setLoading(true);
    setError(null);

    // Small delay before reconnecting
    setTimeout(() => {
      if (mountedRef.current) {
        reconnectAttemptRef.current = 0;
        connect();
      }
    }, 100);
  }, [path, disconnect, connect]);

  // Effect: Connect when path changes
  useEffect(() => {
    mountedRef.current = true;

    if (!path) {
      // No path, reset state
      setContent('');
      setLoading(false);
      setError(null);
      setIsStreaming(false);
      disconnect();
      return;
    }

    // Connect to WebSocket
    reconnectAttemptRef.current = 0;
    connect();

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [path, connect, disconnect]);

  return {
    content,
    error,
    loading,
    isStreaming,
    reload,
    connected,
  };
}
