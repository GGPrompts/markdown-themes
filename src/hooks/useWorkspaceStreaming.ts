import { useState, useEffect, useRef, useCallback } from 'react';
import { createWebSocket, clearAuthToken } from '../lib/api';

interface UseWorkspaceStreamingOptions {
  workspacePath: string | null;
  enabled: boolean;
  streamingTimeout?: number;
}

interface UseWorkspaceStreamingResult {
  streamingFile: string | null;
  connected: boolean;
  /** Set of all files that have changed during this session */
  changedFiles: Set<string>;
  /** Clear the changed files set */
  clearChangedFiles: () => void;
}

interface WorkspaceFileChangeMessage {
  type: 'workspace-file-change';
  path: string;
  timeSinceLastChange: number;
}

interface WorkspaceWatchErrorMessage {
  type: 'workspace-watch-error';
  error: string;
}

type WorkspaceMessage = WorkspaceFileChangeMessage | WorkspaceWatchErrorMessage;

/**
 * Hook to monitor workspace-wide file changes and detect streaming files.
 * Subscribes to a "workspace-watch" WebSocket message that monitors all file changes
 * in the workspace directory and returns which file is currently being actively edited.
 */
export function useWorkspaceStreaming({
  workspacePath,
  enabled,
  streamingTimeout = 3000,
}: UseWorkspaceStreamingOptions): UseWorkspaceStreamingResult {
  const [streamingFile, setStreamingFile] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [changedFiles, setChangedFiles] = useState<Set<string>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const currentPathRef = useRef<string | null>(null);
  const maxReconnectAttempts = 5;
  const mountedRef = useRef(true);

  // Clear changed files (e.g., when switching workspaces or manually clearing)
  const clearChangedFiles = useCallback(() => {
    setChangedFiles(new Set());
  }, []);

  // Clear streaming timer
  const clearStreamingTimer = useCallback(() => {
    if (streamingTimerRef.current) {
      clearTimeout(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
  }, []);

  // Subscribe to workspace watching
  const subscribeTo = useCallback((ws: WebSocket, path: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'workspace-watch', path }));
    }
  }, []);

  // Unsubscribe from workspace watching
  const unsubscribeFrom = useCallback((ws: WebSocket, path: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'workspace-unwatch',
          path,
        })
      );
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!mountedRef.current) return;

      try {
        const message = JSON.parse(event.data) as WorkspaceMessage;

        if (message.type === 'workspace-file-change') {
          // Server only sends this for first change or streaming, so always open
          setStreamingFile(message.path);

          // Accumulate changed files for the Changed filter
          setChangedFiles((prev) => {
            if (prev.has(message.path)) return prev;
            const next = new Set(prev);
            next.add(message.path);
            return next;
          });

          // Reset streaming state after timeout
          clearStreamingTimer();
          streamingTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setStreamingFile(null);
            }
          }, streamingTimeout);
        }
      } catch (err) {
        // Ignore parse errors for non-workspace messages
      }
    },
    [streamingTimeout, clearStreamingTimer]
  );

  // Connect to WebSocket
  const connect = useCallback(
    async (path: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        subscribeTo(wsRef.current, path);
        return;
      }

      if (wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

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
              if (!enabled) return;
              if (mountedRef.current && currentPathRef.current) {
                connect(currentPathRef.current);
              }
            }, delay);
          }
        };

        ws.onerror = (error) => {
          console.error('[useWorkspaceStreaming] WebSocket error:', error);
          clearAuthToken();
        };
      } catch (err) {
        if (!mountedRef.current) return;

        setConnected(false);
        clearAuthToken();

        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
          reconnectAttemptRef.current++;

          setTimeout(() => {
            if (!enabled) return;
            if (mountedRef.current && currentPathRef.current) {
              connect(currentPathRef.current);
            }
          }, delay);
        }
      }
    },
    [handleMessage, subscribeTo, enabled]
  );

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN && currentPathRef.current) {
        unsubscribeFrom(wsRef.current, currentPathRef.current);
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setStreamingFile(null);
    clearStreamingTimer();
  }, [clearStreamingTimer, unsubscribeFrom]);

  // Effect: Handle workspace path and enabled state changes
  useEffect(() => {
    const previousPath = currentPathRef.current;
    currentPathRef.current = workspacePath;
    mountedRef.current = true;

    if (!workspacePath || !enabled) {
      // Not enabled or no workspace, disconnect
      if (previousPath && wsRef.current?.readyState === WebSocket.OPEN) {
        unsubscribeFrom(wsRef.current, previousPath);
      }
      setStreamingFile(null);
      // Don't fully disconnect - just unsubscribe
      return;
    }

    // If we have a connection, switch subscription
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (previousPath && previousPath !== workspacePath) {
        unsubscribeFrom(wsRef.current, previousPath);
        // Clear changed files when workspace changes
        setChangedFiles(new Set());
      }
      subscribeTo(wsRef.current, workspacePath);
    } else {
      // Need to establish connection
      reconnectAttemptRef.current = 0;
      // Clear changed files when starting fresh connection
      if (previousPath !== workspacePath) {
        setChangedFiles(new Set());
      }
      connect(workspacePath);
    }
  }, [workspacePath, enabled, connect, subscribeTo, unsubscribeFrom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    streamingFile,
    connected,
    changedFiles,
    clearChangedFiles,
  };
}
