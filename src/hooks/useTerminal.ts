import { useEffect, useRef, useCallback, useState } from 'react';
import { createWebSocket } from '../lib/api';

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  command?: string;
}

interface UseTerminalOptions {
  onOutput?: (terminalId: string, data: string) => void;
  onSpawned?: (info: { terminalId: string; cwd: string; cols: number; rows: number }) => void;
  onClosed?: (terminalId: string) => void;
  onError?: (terminalId: string, error: string) => void;
}

export function useTerminal({ onOutput, onSpawned, onClosed, onError }: UseTerminalOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onOutput, onSpawned, onClosed, onError });

  // Keep callbacks fresh without re-triggering effects
  useEffect(() => {
    callbacksRef.current = { onOutput, onSpawned, onClosed, onError };
  });

  // Connect WebSocket
  useEffect(() => {
    mountedRef.current = true;
    let ws: WebSocket | null = null;

    const connect = async () => {
      try {
        ws = await createWebSocket();
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setConnected(true);
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
              case 'terminal-output':
                if (msg.terminalId && callbacksRef.current.onOutput) {
                  const decoded = atob(msg.data);
                  callbacksRef.current.onOutput(msg.terminalId, decoded);
                }
                break;
              case 'terminal-spawned':
                callbacksRef.current.onSpawned?.(msg);
                break;
              case 'terminal-closed':
                callbacksRef.current.onClosed?.(msg.terminalId);
                break;
              case 'terminal-error':
                callbacksRef.current.onError?.(msg.terminalId, msg.error);
                break;
            }
          } catch {
            // Ignore non-JSON or irrelevant messages
          }
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setConnected(false);
          wsRef.current = null;
          // Reconnect with backoff
          if (reconnectAttemptRef.current < 5) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
            reconnectAttemptRef.current++;
            setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          // onclose will fire after this
        };
      } catch {
        if (mountedRef.current && reconnectAttemptRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
          reconnectAttemptRef.current++;
          setTimeout(connect, delay);
        }
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (ws) {
        ws.close();
      }
    };
  }, []); // Single connection for the lifetime of the hook

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const spawn = useCallback((id: string, cwd: string, cols: number, rows: number, command?: string) => {
    sendMessage({
      type: 'terminal-spawn',
      terminalId: id,
      cwd,
      cols,
      rows,
      command,
    });
  }, [sendMessage]);

  const reconnect = useCallback((id: string, cols: number, rows: number) => {
    sendMessage({
      type: 'terminal-reconnect',
      terminalId: id,
      cols,
      rows,
    });
  }, [sendMessage]);

  const sendInput = useCallback((id: string, data: string) => {
    sendMessage({
      type: 'terminal-input',
      terminalId: id,
      data: btoa(data),
    });
  }, [sendMessage]);

  const resize = useCallback((id: string, cols: number, rows: number) => {
    sendMessage({
      type: 'terminal-resize',
      terminalId: id,
      cols,
      rows,
    });
  }, [sendMessage]);

  const close = useCallback((id: string) => {
    sendMessage({
      type: 'terminal-close',
      terminalId: id,
    });
  }, [sendMessage]);

  return {
    connected,
    spawn,
    reconnect,
    sendInput,
    resize,
    close,
  };
}
