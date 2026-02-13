import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { TerminalPanel } from './TerminalPanel';
import type { TerminalTab } from '../hooks/useTerminal';
import { createMockTerminalHelpers } from '../test/mocks/mockTerminal';

// ---- Mocks ----

// Track useTerminal callbacks so tests can trigger backend events
let capturedCallbacks: Record<string, (...args: unknown[]) => void> = {};
const mockUseTerminal = {
  connected: true,
  spawn: vi.fn(),
  reconnect: vi.fn(),
  sendInput: vi.fn(),
  resize: vi.fn(),
  disconnect: vi.fn(),
  close: vi.fn(),
};

vi.mock('../hooks/useTerminal', () => ({
  useTerminal: (options: Record<string, unknown>) => {
    // Capture the latest callbacks
    for (const key of ['onOutput', 'onSpawned', 'onClosed', 'onError', 'onConnected', 'onRecoveryComplete']) {
      if (typeof options[key] === 'function') {
        capturedCallbacks[key] = options[key] as (...args: unknown[]) => void;
      }
    }
    return mockUseTerminal;
  },
}));

// Mock Terminal component — immediately calls onReady synchronously
const terminalReadyHelpers = new Map<string, ReturnType<typeof createMockTerminalHelpers>>();
vi.mock('./Terminal', () => ({
  Terminal: ({ terminalId, onReady }: { terminalId: string; onReady?: (helpers: ReturnType<typeof createMockTerminalHelpers>) => void }) => {
    const helpers = createMockTerminalHelpers();
    terminalReadyHelpers.set(terminalId, helpers);
    // Call onReady synchronously so tests don't need to advance timers
    if (onReady) onReady(helpers);
    return <div data-testid={`terminal-${terminalId}`}>Terminal: {terminalId}</div>;
  },
}));

// Mock FilePickerModal
vi.mock('./FilePickerModal', () => ({
  FilePickerModal: () => <div data-testid="file-picker-modal" />,
}));

// Mock fetch for profile API
const mockProfiles = [
  { id: 'default-shell', name: 'Shell', cwd: '{{workspace}}' },
  { id: 'dev-server', name: 'Dev Server', command: 'npm run dev', cwd: '{{workspace}}' },
];

// ---- Helpers ----

function renderPanel(
  overrides: Partial<{
    tabs: TerminalTab[];
    activeTabId: string | null;
    workspacePath: string;
    onTabsChange: React.Dispatch<React.SetStateAction<TerminalTab[]>>;
    onActiveTabChange: React.Dispatch<React.SetStateAction<string | null>>;
    onClose: () => void;
  }> = {}
) {
  const tabs = overrides.tabs ?? [];
  const activeTabId = overrides.activeTabId ?? null;
  const onTabsChange = overrides.onTabsChange ?? vi.fn();
  const onActiveTabChange = overrides.onActiveTabChange ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();

  return render(
    <TerminalPanel
      tabs={tabs}
      activeTabId={activeTabId}
      workspacePath={overrides.workspacePath ?? '/home/user/project'}
      onTabsChange={onTabsChange}
      onActiveTabChange={onActiveTabChange}
      onClose={onClose}
    />
  );
}

describe('TerminalPanel', () => {
  beforeEach(() => {
    capturedCallbacks = {};
    terminalReadyHelpers.clear();
    mockUseTerminal.spawn.mockClear();
    mockUseTerminal.reconnect.mockClear();
    mockUseTerminal.close.mockClear();
    mockUseTerminal.connected = true;

    // Mock fetch for profiles
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([...mockProfiles]),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- Tab management ----------

  describe('tab management', () => {
    it('renders tabs for each TerminalTab', () => {
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
        { id: 'mt-dev-2', title: 'Dev Server', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1' });

      expect(screen.getByText('Shell')).toBeInTheDocument();
      expect(screen.getByText('Dev Server')).toBeInTheDocument();
    });

    it('clicking a tab calls onActiveTabChange', () => {
      const onActiveTabChange = vi.fn();
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
        { id: 'mt-dev-2', title: 'Dev', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1', onActiveTabChange });

      fireEvent.click(screen.getByText('Dev'));
      expect(onActiveTabChange).toHaveBeenCalledWith('mt-dev-2');
    });

    it('closing a tab calls close() on the hook', () => {
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1' });

      // The tab close button is inside the tab row
      const tabRow = screen.getByText('Shell').parentElement;
      const xButton = tabRow?.querySelector('button');
      if (xButton) fireEvent.click(xButton);

      expect(mockUseTerminal.close).toHaveBeenCalledWith('mt-bash-1');
    });

    it('renders Terminal component for each tab', () => {
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
        { id: 'mt-dev-2', title: 'Dev', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1' });

      expect(screen.getByTestId('terminal-mt-bash-1')).toBeInTheDocument();
      expect(screen.getByTestId('terminal-mt-dev-2')).toBeInTheDocument();
    });

    it('shows reconnecting indicator for tabs with reconnecting flag', () => {
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home', reconnecting: true },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1' });

      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
    });
  });

  // ---------- Spawning ----------

  describe('spawning', () => {
    it('new terminal button calls onTabsChange with updater that appends a tab', () => {
      const onTabsChange = vi.fn();
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1', onTabsChange });

      const newTerminalButton = screen.getByTitle('New terminal (Ctrl+Shift+T)');
      fireEvent.click(newTerminalButton);

      // Find the call that appends a new tab
      const appendCall = onTabsChange.mock.calls.find(call => {
        if (typeof call[0] === 'function') {
          const result = call[0](tabs);
          return result.length > tabs.length;
        }
        return false;
      });

      expect(appendCall).toBeDefined();
      const result = appendCall![0](tabs);
      expect(result).toHaveLength(2);
      expect(result[1].id).toMatch(/^mt-/);
      expect(result[1].title).toBe('Shell');
    });

    it('auto-spawns first terminal when connected with 0 tabs', () => {
      const onTabsChange = vi.fn();
      renderPanel({ tabs: [], activeTabId: null, onTabsChange });

      // The auto-spawn effect fires synchronously (useEffect with tabs.length === 0 && connected)
      // onTabsChange should have been called with an updater that adds a tab
      const addCall = onTabsChange.mock.calls.find(call => {
        if (typeof call[0] === 'function') {
          const result = call[0]([]);
          return result.length === 1 && result[0].id?.startsWith('mt-');
        }
        return false;
      });

      expect(addCall).toBeDefined();
    });
  });

  // ---------- Profiles ----------

  describe('profiles', () => {
    it('loads profiles from GET on mount', async () => {
      renderPanel();
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/terminal/profiles'));
      });
    });

    it('falls back to default Shell profile on fetch error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
      renderPanel();

      // Wait for the fetch error to settle
      await act(async () => {
        await new Promise(r => setTimeout(r, 0));
      });

      // Open profile menu
      const profileButton = screen.getByTitle('Terminal profiles');
      fireEvent.click(profileButton);

      // Should have the fallback "Shell" profile
      expect(screen.getByText('Shell')).toBeInTheDocument();
    });

    it('profile menu shows profiles after loading', async () => {
      renderPanel();

      // Wait for fetch to resolve
      await act(async () => {
        await new Promise(r => setTimeout(r, 0));
      });

      const profileButton = screen.getByTitle('Terminal profiles');
      fireEvent.click(profileButton);

      expect(screen.getByText('Dev Server')).toBeInTheDocument();
    });

    it('clicking profile spawns terminal with profile settings', async () => {
      const onTabsChange = vi.fn();
      renderPanel({ onTabsChange });

      // Wait for profiles to load
      await act(async () => {
        await new Promise(r => setTimeout(r, 0));
      });

      const profileButton = screen.getByTitle('Terminal profiles');
      fireEvent.click(profileButton);

      fireEvent.click(screen.getByText('Dev Server'));

      // Find the call that adds a tab with the profile's settings
      const lastCall = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1];
      const updater = lastCall[0];
      const result = typeof updater === 'function' ? updater([]) : [];
      expect(result[0].command).toBe('npm run dev');
      expect(result[0].profileName).toBe('Dev Server');
    });

    it('replaces {{workspace}} in profile cwd', async () => {
      const onTabsChange = vi.fn();
      renderPanel({ onTabsChange, workspacePath: '/my/project' });

      // Wait for profiles to load
      await act(async () => {
        await new Promise(r => setTimeout(r, 0));
      });

      // Open and click a profile
      fireEvent.click(screen.getByTitle('Terminal profiles'));

      // Click the Shell profile in the menu (there might be multiple "Shell" texts)
      const shellItems = screen.getAllByText('Shell');
      // The one in the profile menu dropdown
      const profileMenuItem = shellItems.find(el => el.closest('[class*="absolute"]'));
      if (profileMenuItem) fireEvent.click(profileMenuItem);

      const lastCall = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1];
      const updater = lastCall[0];
      const result = typeof updater === 'function' ? updater([]) : [];
      expect(result[0].cwd).toBe('/my/project');
    });
  });

  // ---------- Event routing from useTerminal ----------

  describe('event routing', () => {
    it('onOutput writes to correct terminal via registered helpers', () => {
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
        { id: 'mt-dev-2', title: 'Dev', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1' });

      const helpers1 = terminalReadyHelpers.get('mt-bash-1');
      const helpers2 = terminalReadyHelpers.get('mt-dev-2');

      // Trigger onOutput callback for terminal 1
      if (capturedCallbacks.onOutput) {
        act(() => capturedCallbacks.onOutput('mt-bash-1', new Uint8Array([104, 105])));
      }

      expect(helpers1?.write).toHaveBeenCalledWith(new Uint8Array([104, 105]));
      expect(helpers2?.write).not.toHaveBeenCalled();
    });

    it('onSpawned stores tmuxSession on the tab', () => {
      const onTabsChange = vi.fn();
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1', onTabsChange });

      if (capturedCallbacks.onSpawned) {
        act(() => capturedCallbacks.onSpawned({ terminalId: 'mt-bash-1', tmuxSession: 'mt-bash-1', cwd: '/home' }));
      }

      // onTabsChange should be called with updater that sets tmuxSession
      const lastCall = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1];
      const updater = lastCall[0];
      const result = updater(tabs);
      expect(result[0].tmuxSession).toBe('mt-bash-1');
      expect(result[0].reconnecting).toBe(false);
    });

    it('onClosed removes tab', () => {
      const onTabsChange = vi.fn();
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
        { id: 'mt-dev-2', title: 'Dev', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1', onTabsChange });

      if (capturedCallbacks.onClosed) {
        act(() => capturedCallbacks.onClosed('mt-bash-1'));
      }

      const lastCall = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1];
      const updater = lastCall[0];
      const result = updater(tabs);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mt-dev-2');
    });

    it('onError with duplicate spawn is silently ignored', () => {
      const onTabsChange = vi.fn();
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1', onTabsChange });

      const callsBefore = onTabsChange.mock.calls.length;

      if (capturedCallbacks.onError) {
        act(() => capturedCallbacks.onError('mt-bash-1', 'duplicate spawn rejected: ...'));
      }

      // Should NOT modify tabs (no additional calls)
      expect(onTabsChange.mock.calls.length).toBe(callsBefore);
    });

    it('onError with generic error clears reconnecting flag', () => {
      const onTabsChange = vi.fn();
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home', reconnecting: true },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1', onTabsChange });

      if (capturedCallbacks.onError) {
        act(() => capturedCallbacks.onError('mt-bash-1', 'some generic error'));
      }

      // Should clear reconnecting flag
      const lastCall = onTabsChange.mock.calls[onTabsChange.mock.calls.length - 1];
      const updater = lastCall[0];
      const result = updater(tabs);
      expect(result[0].reconnecting).toBe(false);
    });
  });

  // ---------- Recovery ----------

  describe('recovery', () => {
    it('onRecoveryComplete callback is captured by useTerminal', () => {
      renderPanel({ tabs: [{ id: 'mt-bash-1', title: 'Shell', cwd: '/home' }], activeTabId: 'mt-bash-1' });

      expect(capturedCallbacks.onRecoveryComplete).toBeDefined();
    });

    it('onRecoveryComplete with no tabs is a no-op', () => {
      const onTabsChange = vi.fn();
      renderPanel({ tabs: [], activeTabId: null, onTabsChange });

      const callsBefore = onTabsChange.mock.calls.length;

      if (capturedCallbacks.onRecoveryComplete) {
        act(() => capturedCallbacks.onRecoveryComplete([{ id: 'mt-bash-1', cwd: '/home' }]));
      }

      // With 0 tabs, recovery returns early without calling onTabsChange
      expect(onTabsChange.mock.calls.length).toBe(callsBefore);
    });

    it('onRecoveryComplete does not crash with recovered sessions matching existing tabs', () => {
      const onTabsChange = vi.fn();
      const tabs: TerminalTab[] = [
        { id: 'mt-bash-1', title: 'Shell', cwd: '/home' },
      ];
      renderPanel({ tabs, activeTabId: 'mt-bash-1', onTabsChange });

      // Should not throw when called with sessions that match rendered tabs
      expect(() => {
        if (capturedCallbacks.onRecoveryComplete) {
          act(() => capturedCallbacks.onRecoveryComplete([{ id: 'mt-bash-1', cwd: '/home' }]));
        }
      }).not.toThrow();
    });
  });

  // ---------- Close panel ----------

  describe('close panel', () => {
    it('close button calls onClose', () => {
      const onClose = vi.fn();
      renderPanel({ onClose });

      fireEvent.click(screen.getByTitle('Close terminal panel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ---------- Connecting state ----------

  describe('connecting state', () => {
    it('shows connecting message when not connected and no tabs', () => {
      mockUseTerminal.connected = false;
      renderPanel({ tabs: [], activeTabId: null });

      expect(screen.getByText('Connecting to backend...')).toBeInTheDocument();
    });
  });
});
