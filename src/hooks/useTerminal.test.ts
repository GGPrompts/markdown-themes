import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminal } from './useTerminal';
import { MockWebSocket, mockWebSocketInstances, setupMockWebSocket } from '../test/mocks/MockWebSocket';

// Mock createWebSocket from api module
const { createWebSocket } = setupMockWebSocket();
vi.mock('../lib/api', () => ({
  createWebSocket: (...args: unknown[]) => createWebSocket(...args),
}));

function getWs(): MockWebSocket {
  return mockWebSocketInstances[mockWebSocketInstances.length - 1];
}

describe('useTerminal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWebSocketInstances.length = 0;
    createWebSocket.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: render hook, wait for WS creation, open it.
  // Returns { result, ws, unmount } where result is the { current: ... } ref.
  async function renderAndConnect(options: Parameters<typeof useTerminal>[0] = {}) {
    const hookReturn = renderHook(() => useTerminal(options));
    // createWebSocket is async — flush the microtask
    await act(async () => {});
    const ws = getWs();
    act(() => ws.simulateOpen());
    return { result: hookReturn.result, ws, unmount: hookReturn.unmount };
  }

  // ---------- Connection ----------

  describe('connection', () => {
    it('starts disconnected, becomes connected on WS open', async () => {
      const { result } = renderHook(() => useTerminal({}));
      await act(async () => {});
      expect(result.current.connected).toBe(false);

      const ws = getWs();
      act(() => ws.simulateOpen());
      expect(result.current.connected).toBe(true);
    });

    it('becomes disconnected on WS close', async () => {
      const { result, ws } = await renderAndConnect();
      expect(result.current.connected).toBe(true);

      act(() => ws.simulateClose());
      expect(result.current.connected).toBe(false);
    });

    it('fires onConnected callback on open', async () => {
      const onConnected = vi.fn();
      renderHook(() => useTerminal({ onConnected }));
      await act(async () => {});
      const ws = getWs();
      act(() => ws.simulateOpen());
      expect(onConnected).toHaveBeenCalledTimes(1);
    });

    it('resets reconnect counter on successful connect', async () => {
      const { result, ws } = await renderAndConnect();

      // Close to trigger reconnect
      act(() => ws.simulateClose());
      // Advance to trigger first reconnect (1s)
      await act(async () => { vi.advanceTimersByTime(1000); });
      const ws2 = getWs();

      // Open the new connection
      act(() => ws2.simulateOpen());
      expect(result.current.connected).toBe(true);

      // Close again — should reconnect at 1s (reset), not 2s
      act(() => ws2.simulateClose());
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(mockWebSocketInstances.length).toBe(3);
    });
  });

  // ---------- Message routing ----------

  describe('message routing', () => {
    it('routes terminal-output to onOutput with decoded Uint8Array', async () => {
      const onOutput = vi.fn();
      const { ws } = await renderAndConnect({ onOutput });

      // "hello" in base64
      const base64Hello = btoa('hello');
      act(() => ws.simulateMessage({ type: 'terminal-output', terminalId: 't1', data: base64Hello }));

      expect(onOutput).toHaveBeenCalledTimes(1);
      expect(onOutput).toHaveBeenCalledWith('t1', expect.any(Uint8Array));

      const bytes = onOutput.mock.calls[0][1] as Uint8Array;
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe('hello');
    });

    it('routes terminal-spawned to onSpawned', async () => {
      const onSpawned = vi.fn();
      const { ws } = await renderAndConnect({ onSpawned });

      const msg = { type: 'terminal-spawned', terminalId: 't1', tmuxSession: 'mt-bash-abc', cwd: '/home', cols: 120, rows: 30 };
      act(() => ws.simulateMessage(msg));

      expect(onSpawned).toHaveBeenCalledTimes(1);
      expect(onSpawned).toHaveBeenCalledWith(msg);
    });

    it('routes terminal-closed to onClosed', async () => {
      const onClosed = vi.fn();
      const { ws } = await renderAndConnect({ onClosed });

      act(() => ws.simulateMessage({ type: 'terminal-closed', terminalId: 't1' }));
      expect(onClosed).toHaveBeenCalledWith('t1');
    });

    it('routes terminal-error to onError', async () => {
      const onError = vi.fn();
      const { ws } = await renderAndConnect({ onError });

      act(() => ws.simulateMessage({ type: 'terminal-error', terminalId: 't1', error: 'something broke' }));
      expect(onError).toHaveBeenCalledWith('t1', 'something broke');
    });

    it('routes terminal-recovery-complete to onRecoveryComplete', async () => {
      const onRecoveryComplete = vi.fn();
      const { ws } = await renderAndConnect({ onRecoveryComplete });

      const sessions = [{ id: 'mt-bash-abc', cwd: '/home' }];
      act(() => ws.simulateMessage({ type: 'terminal-recovery-complete', recoveredSessions: sessions }));
      expect(onRecoveryComplete).toHaveBeenCalledWith(sessions);
    });

    it('passes empty array when recovery-complete has no sessions', async () => {
      const onRecoveryComplete = vi.fn();
      const { ws } = await renderAndConnect({ onRecoveryComplete });

      act(() => ws.simulateMessage({ type: 'terminal-recovery-complete' }));
      expect(onRecoveryComplete).toHaveBeenCalledWith([]);
    });

    it('ignores unknown message types', async () => {
      const onOutput = vi.fn();
      const { ws } = await renderAndConnect({ onOutput });

      act(() => ws.simulateMessage({ type: 'file-change', path: '/foo' }));
      expect(onOutput).not.toHaveBeenCalled();
    });

    it('ignores non-JSON messages', async () => {
      const onOutput = vi.fn();
      const { ws } = await renderAndConnect({ onOutput });

      act(() => ws.simulateMessage('not json{{{'));
      expect(onOutput).not.toHaveBeenCalled();
    });
  });

  // ---------- Base64 encoding ----------

  describe('base64 encoding', () => {
    it('sendInput encodes UTF-8 to base64', async () => {
      const { result, ws } = await renderAndConnect();

      act(() => result.current.sendInput('t1', 'hello'));

      const msg = ws.getLastSentMessage();
      expect(msg?.type).toBe('terminal-input');
      expect(msg?.terminalId).toBe('t1');

      // Decode and verify roundtrip
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(msg?.data as string), c => c.charCodeAt(0))
      );
      expect(decoded).toBe('hello');
    });

    it('sendInput handles multi-byte characters (emoji)', async () => {
      const { result, ws } = await renderAndConnect();

      act(() => result.current.sendInput('t1', '🚀'));

      const msg = ws.getLastSentMessage();
      const binaryStr = atob(msg?.data as string);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe('🚀');
    });

    it('onOutput decodes base64 to Uint8Array preserving bytes', async () => {
      const onOutput = vi.fn();
      const { ws } = await renderAndConnect({ onOutput });

      // Encode "hello" to base64 the same way the Go backend does
      const bytes = new TextEncoder().encode('hello');
      const base64 = btoa(String.fromCharCode(...bytes));

      act(() => ws.simulateMessage({ type: 'terminal-output', terminalId: 't1', data: base64 }));

      const received = onOutput.mock.calls[0][1] as Uint8Array;
      expect(new TextDecoder().decode(received)).toBe('hello');
    });
  });

  // ---------- Actions ----------

  describe('actions', () => {
    it('spawn sends correct message shape', async () => {
      const { result, ws } = await renderAndConnect();

      act(() => result.current.spawn('t1', '/home', 120, 30, 'bash', 'req-1', 'Shell'));

      expect(ws.getLastSentMessage()).toEqual({
        type: 'terminal-spawn',
        terminalId: 't1',
        cwd: '/home',
        cols: 120,
        rows: 30,
        command: 'bash',
        requestId: 'req-1',
        profileName: 'Shell',
      });
    });

    it('reconnect sends correct message shape', async () => {
      const { result, ws } = await renderAndConnect();

      act(() => result.current.reconnect('t1', 80, 24));

      expect(ws.getLastSentMessage()).toEqual({
        type: 'terminal-reconnect',
        terminalId: 't1',
        cols: 80,
        rows: 24,
      });
    });

    it('resize sends correct message shape', async () => {
      const { result, ws } = await renderAndConnect();

      act(() => result.current.resize('t1', 100, 50));

      expect(ws.getLastSentMessage()).toEqual({
        type: 'terminal-resize',
        terminalId: 't1',
        cols: 100,
        rows: 50,
      });
    });

    it('disconnect sends correct message shape', async () => {
      const { result, ws } = await renderAndConnect();

      act(() => result.current.disconnect('t1'));

      expect(ws.getLastSentMessage()).toEqual({
        type: 'terminal-disconnect',
        terminalId: 't1',
      });
    });

    it('close sends correct message shape', async () => {
      const { result, ws } = await renderAndConnect();

      act(() => result.current.close('t1'));

      expect(ws.getLastSentMessage()).toEqual({
        type: 'terminal-close',
        terminalId: 't1',
      });
    });
  });

  // ---------- Message gating ----------

  describe('message gating', () => {
    it('all actions are no-ops when WS is not OPEN', async () => {
      const { result } = renderHook(() => useTerminal({}));
      await act(async () => {});
      const ws = getWs();
      // WS is still CONNECTING (not OPEN)

      act(() => {
        result.current.spawn('t1', '/home', 120, 30);
        result.current.reconnect('t1', 80, 24);
        result.current.sendInput('t1', 'hello');
        result.current.resize('t1', 100, 50);
        result.current.disconnect('t1');
        result.current.close('t1');
      });

      expect(ws.sent).toHaveLength(0);
    });

    it('actions work after WS opens', async () => {
      const { result, ws } = await renderAndConnect();

      act(() => result.current.spawn('t1', '/home', 120, 30));
      expect(ws.sent).toHaveLength(1);
    });
  });

  // ---------- Reconnection ----------

  describe('reconnection', () => {
    it('reconnects with exponential backoff on close', async () => {
      const { ws } = await renderAndConnect();

      // Close triggers reconnect
      act(() => ws.simulateClose());

      // 1s delay for first reconnect
      expect(mockWebSocketInstances.length).toBe(1);
      await act(async () => { vi.advanceTimersByTime(999); });
      expect(mockWebSocketInstances.length).toBe(1);
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(mockWebSocketInstances.length).toBe(2);
    });

    it('doubles delay on successive reconnects (1s, 2s, 4s)', async () => {
      const { ws: ws1 } = await renderAndConnect();

      // First close -> 1s delay
      act(() => ws1.simulateClose());
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(mockWebSocketInstances.length).toBe(2);
      const ws2 = getWs();

      // Second close -> 2s delay
      act(() => ws2.simulateClose());
      await act(async () => { vi.advanceTimersByTime(1999); });
      expect(mockWebSocketInstances.length).toBe(2);
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(mockWebSocketInstances.length).toBe(3);
      const ws3 = getWs();

      // Third close -> 4s delay
      act(() => ws3.simulateClose());
      await act(async () => { vi.advanceTimersByTime(3999); });
      expect(mockWebSocketInstances.length).toBe(3);
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(mockWebSocketInstances.length).toBe(4);
    });

    it('caps delay at 10s', async () => {
      const { ws: ws1 } = await renderAndConnect();

      // Close + reopen 4 times to get delay up to 2^4 = 16s, capped at 10s
      let currentWs = ws1;
      for (let i = 0; i < 4; i++) {
        act(() => currentWs.simulateClose());
        await act(async () => { vi.advanceTimersByTime(10000); });
        currentWs = getWs();
      }

      // 5th attempt at 10s cap
      act(() => currentWs.simulateClose());
      await act(async () => { vi.advanceTimersByTime(9999); });
      const countBefore = mockWebSocketInstances.length;
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(mockWebSocketInstances.length).toBe(countBefore + 1);
    });

    it('stops reconnecting after 5 attempts', async () => {
      const { ws: ws1 } = await renderAndConnect();

      let currentWs = ws1;
      // Use up all 5 reconnect attempts
      for (let i = 0; i < 5; i++) {
        act(() => currentWs.simulateClose());
        await act(async () => { vi.advanceTimersByTime(10000); });
        currentWs = getWs();
      }

      const countAfterFive = mockWebSocketInstances.length;
      // 6th close should not trigger another reconnect
      act(() => currentWs.simulateClose());
      await act(async () => { vi.advanceTimersByTime(30000); });
      expect(mockWebSocketInstances.length).toBe(countAfterFive);
    });

    it('also reconnects on initial connection failure', async () => {
      // Make createWebSocket throw on first call
      createWebSocket.mockRejectedValueOnce(new Error('connection refused'));

      renderHook(() => useTerminal({}));
      await act(async () => {});

      // Should schedule a reconnect at 1s
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(mockWebSocketInstances.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------- Cleanup ----------

  describe('cleanup', () => {
    it('closes WS on unmount', async () => {
      const { ws, unmount } = await renderAndConnect();

      unmount();
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('ignores messages after unmount', async () => {
      const onOutput = vi.fn();
      const { ws, unmount } = await renderAndConnect({ onOutput });

      unmount();
      act(() => ws.simulateMessage({ type: 'terminal-output', terminalId: 't1', data: btoa('hi') }));
      expect(onOutput).not.toHaveBeenCalled();
    });
  });
});
