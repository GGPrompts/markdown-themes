import { vi } from 'vitest';

/**
 * Controllable WebSocket mock for testing useTerminal hook.
 * Exposes simulate* methods to drive WebSocket events from tests.
 */
export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // --- Simulation helpers ---

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.(new MessageEvent('message', { data: json }));
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }

  /** Get all sent messages as parsed JSON */
  getSentMessages(): Record<string, unknown>[] {
    return this.sent.map(s => JSON.parse(s));
  }

  /** Get the last sent message as parsed JSON */
  getLastSentMessage(): Record<string, unknown> | undefined {
    if (this.sent.length === 0) return undefined;
    return JSON.parse(this.sent[this.sent.length - 1]);
  }
}

/** Tracks all MockWebSocket instances created, newest last */
export const mockWebSocketInstances: MockWebSocket[] = [];

/** Create a mock createWebSocket that returns controllable MockWebSocket instances */
export function setupMockWebSocket() {
  mockWebSocketInstances.length = 0;

  const createWebSocket = vi.fn(async () => {
    const ws = new MockWebSocket();
    mockWebSocketInstances.push(ws);
    return ws as unknown as WebSocket;
  });

  return { createWebSocket };
}
