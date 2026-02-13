import { vi } from 'vitest';

/**
 * Creates mock terminal helpers that simulate what Terminal.tsx's onReady returns.
 */
export function createMockTerminalHelpers() {
  return {
    write: vi.fn(),
    fit: vi.fn(() => ({ cols: 120, rows: 30 })),
    focus: vi.fn(),
    clear: vi.fn(),
  };
}

/**
 * Creates a mock useTerminal hook return value with controllable callbacks.
 * Call `triggerCallback(name, ...args)` to simulate backend events.
 */
export function createMockUseTerminal() {
  const callbacks: Record<string, (...args: unknown[]) => void> = {};

  const mockHook = {
    connected: true,
    spawn: vi.fn(),
    reconnect: vi.fn(),
    sendInput: vi.fn(),
    resize: vi.fn(),
    disconnect: vi.fn(),
    close: vi.fn(),
  };

  // Intercept the hook options to capture callbacks
  const hookFactory = (options: Record<string, unknown>) => {
    for (const key of ['onOutput', 'onSpawned', 'onClosed', 'onError', 'onConnected', 'onRecoveryComplete']) {
      if (typeof options[key] === 'function') {
        callbacks[key] = options[key] as (...args: unknown[]) => void;
      }
    }
    return mockHook;
  };

  return {
    mockHook,
    hookFactory,
    callbacks,
    triggerCallback: (name: string, ...args: unknown[]) => {
      callbacks[name]?.(...args);
    },
  };
}
