import { useEffect, useRef, useCallback, useState } from 'react';
import { createWebSocket } from '../lib/api';

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  command?: string;
  profileName?: string;
  /** The tmux session name backing this terminal (same as id for mt-* terminals) */
  tmuxSession?: string;
}

interface UseTerminalOptions {
  onOutput?: (terminalId: string, data: string | Uint8Array) => void;
  onSpawned?: (info: { terminalId: string; tmuxSession?: string; cwd: string; cols: number; rows: number; reconnected?: boolean }) => void;
  onClosed?: (terminalId: string) => void;
  onError?: (terminalId: string, error: string) => void;
  onConnected?: () => void;
}

export function useTerminal({ onOutput, onSpawned, onClosed, onError, onConnected }: UseTerminalOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onOutput, onSpawned, onClosed, onError, onConnected });

  // Keep callbacks fresh without re-triggering effects
  useEffect(() => {
    callbacksRef.current = { onOutput, onSpawned, onClosed, onError, onConnected };
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
          callbacksRef.current.onConnected?.();
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
              case 'terminal-output':
                if (msg.terminalId && callbacksRef.current.onOutput) {
                  // Decode base64 -> Uint8Array (raw bytes) instead of atob() which
                  // produces Latin-1 strings that corrupt multi-byte UTF-8 sequences
                  // (box-drawing characters, emojis, CJK, etc.)
                  const binaryStr = atob(msg.data);
                  const bytes = new Uint8Array(binaryStr.length);
                  for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                  }
                  callbacksRef.current.onOutput(msg.terminalId, bytes);
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

  const spawn = useCallback((id: string, cwd: string, cols: number, rows: number, command?: string, requestId?: string, profileName?: string) => {
    sendMessage({
      type: 'terminal-spawn',
      terminalId: id,
      cwd,
      cols,
      rows,
      command,
      requestId,
      profileName,
    });
  }, [sendMessage]);

  /** Reconnect to an existing tmux session. The terminalId IS the tmux session name. */
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
      data: btoa(String.fromCharCode(...new TextEncoder().encode(data))),
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

  /** Disconnect: detach PTY but keep tmux session alive for later reconnection. */
  const disconnect = useCallback((id: string) => {
    sendMessage({
      type: 'terminal-disconnect',
      terminalId: id,
    });
  }, [sendMessage]);

  /** Close: kill PTY AND tmux session permanently. */
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
    disconnect,
    close,
  };
}
