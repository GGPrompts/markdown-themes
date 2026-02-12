import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X, MoreVertical, Terminal as TerminalIcon } from 'lucide-react';
import { Terminal } from './Terminal';
import { useTerminal, type TerminalTab, type RecoveredSession } from '../hooks/useTerminal';

const API_BASE = 'http://localhost:8130';

interface TerminalProfile {
  id: string;
  name: string;
  command?: string;
  cwd?: string;
}

interface TerminalPanelProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  workspacePath: string;
  fontSize?: number;
  onTabsChange: React.Dispatch<React.SetStateAction<TerminalTab[]>>;
  onActiveTabChange: React.Dispatch<React.SetStateAction<string | null>>;
  onClose: () => void;
}

function sanitizeProfileName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return sanitized || 'bash';
}

function generateTerminalId(profileName?: string): string {
  const name = sanitizeProfileName(profileName || 'bash');
  const hex = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `mt-${name}-${hex}`;
}

export function TerminalPanel({
  tabs,
  activeTabId,
  workspacePath,
  fontSize = 14,
  onTabsChange,
  onActiveTabChange,
  onClose,
}: TerminalPanelProps) {
  const [profiles, setProfiles] = useState<TerminalProfile[]>([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Map of terminalId -> write function (set when Terminal calls onReady)
  const terminalWritersRef = useRef<Map<string, {
    write: (data: string | Uint8Array) => void;
    fit: () => { cols: number; rows: number } | null;
    focus: () => void;
    clear: () => void;
  }>>(new Map());

  // Track which terminals have been spawned on the backend
  const spawnedRef = useRef<Set<string>>(new Set());

  // Track tabs that need reconnection after WS reconnect
  const pendingReconnectsRef = useRef<Set<string>>(new Set());

  // Track staggered reconnection timers so we can clean up on unmount
  const reconnectTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Track whether we've connected at least once (to distinguish initial connect vs reconnect)
  const hasConnectedRef = useRef(false);

  // Ref to current tabs for use in onConnected callback
  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // Clean up staggered reconnection timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of reconnectTimersRef.current) {
        clearTimeout(timer);
      }
      reconnectTimersRef.current.clear();
    };
  }, []);

  // Ref to the reconnect function -- populated after useTerminal returns.
  // This breaks the circular dependency where onConnected needs reconnect
  // but reconnect comes from the same useTerminal call.
  const reconnectRef = useRef<(id: string, cols: number, rows: number) => void>(() => {});

  const { connected, spawn, reconnect, sendInput, resize, close } = useTerminal({
    onOutput: useCallback((terminalId: string, data: string | Uint8Array) => {
      const helpers = terminalWritersRef.current.get(terminalId);
      if (helpers) {
        helpers.write(data);
      }
    }, []),
    onSpawned: useCallback((info: { terminalId: string; tmuxSession?: string; cwd: string; reconnected?: boolean }) => {
      spawnedRef.current.add(info.terminalId);
      pendingReconnectsRef.current.delete(info.terminalId);

      // Store the tmux session name on the tab and clear reconnecting state
      onTabsChange(prev => prev.map(t =>
        t.id === info.terminalId
          ? { ...t, ...(info.tmuxSession ? { tmuxSession: info.tmuxSession } : {}), reconnecting: false }
          : t
      ));
    }, [onTabsChange]),
    onClosed: useCallback((terminalId: string) => {
      spawnedRef.current.delete(terminalId);
      pendingReconnectsRef.current.delete(terminalId);
      onTabsChange(prev => {
        const remaining = prev.filter((t) => t.id !== terminalId);
        onActiveTabChange(prevActive =>
          prevActive === terminalId
            ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
            : prevActive
        );
        return remaining;
      });
    }, [onTabsChange, onActiveTabChange]),
    onError: useCallback((terminalId: string, error: string) => {
      console.error(`[Terminal] Error for ${terminalId}:`, error);
      // If reconnect fails (tmux session gone), remove the tab
      if (error.includes('tmux session not found') && pendingReconnectsRef.current.has(terminalId)) {
        pendingReconnectsRef.current.delete(terminalId);
        spawnedRef.current.delete(terminalId);
        onTabsChange(prev => {
          const remaining = prev.filter((t) => t.id !== terminalId);
          onActiveTabChange(prevActive =>
            prevActive === terminalId
              ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
              : prevActive
          );
          return remaining;
        });
      } else {
        // Clear reconnecting flag on other errors too
        onTabsChange(prev => prev.map(t =>
          t.id === terminalId ? { ...t, reconnecting: false } : t
        ));
      }
    }, [onTabsChange, onActiveTabChange]),
    onConnected: useCallback(() => {
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        return;
      }
      // WebSocket reconnected -- reconnect all tabs that have tmux sessions
      // Stagger reconnections by 150ms to avoid tmux race conditions
      const currentTabs = tabsRef.current;
      const tabsToReconnect = currentTabs.filter(tab =>
        spawnedRef.current.has(tab.id) || tab.tmuxSession
      );

      // Sort by id for stable ordering across reconnects
      tabsToReconnect.sort((a, b) => a.id.localeCompare(b.id));

      // Mark all reconnecting tabs immediately for visual feedback
      if (tabsToReconnect.length > 0) {
        const reconnectIds = new Set(tabsToReconnect.map(t => t.id));
        onTabsChange(prev => prev.map(t =>
          reconnectIds.has(t.id) ? { ...t, reconnecting: true } : t
        ));
      }

      tabsToReconnect.forEach((tab, index) => {
        const timer = setTimeout(() => {
          reconnectTimersRef.current.delete(timer);
          const helpers = terminalWritersRef.current.get(tab.id);
          if (helpers) {
            const dims = helpers.fit();
            const cols = dims?.cols || 120;
            const rows = dims?.rows || 30;
            pendingReconnectsRef.current.add(tab.id);
            reconnectRef.current(tab.id, cols, rows);
          }
        }, index * 150);
        reconnectTimersRef.current.add(timer);
      });
    }, [onTabsChange]),
    onRecoveryComplete: useCallback((recoveredSessions: RecoveredSession[]) => {
      const currentTabs = tabsRef.current;
      if (currentTabs.length === 0) return;

      const recoveredIds = new Set(recoveredSessions.map(s => s.id));

      // Remove tabs whose tmux sessions no longer exist (stale tabs)
      const staleTabs = currentTabs.filter(tab => !recoveredIds.has(tab.id) && !spawnedRef.current.has(tab.id));
      if (staleTabs.length > 0) {
        const staleIds = new Set(staleTabs.map(t => t.id));
        onTabsChange(prev => {
          const remaining = prev.filter(t => !staleIds.has(t.id));
          onActiveTabChange(prevActive => {
            if (prevActive && staleIds.has(prevActive)) {
              return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
            }
            return prevActive;
          });
          return remaining;
        });
        for (const id of staleIds) {
          spawnedRef.current.delete(id);
          terminalWritersRef.current.delete(id);
        }
      }

      // For tabs that match recovered sessions, trigger staggered reconnects
      const tabsToReconnect = currentTabs.filter(tab =>
        recoveredIds.has(tab.id) && !spawnedRef.current.has(tab.id)
      );

      if (tabsToReconnect.length === 0) return;

      // Sort for stable ordering
      tabsToReconnect.sort((a, b) => a.id.localeCompare(b.id));

      // Mark reconnecting for visual feedback
      const reconnectIds = new Set(tabsToReconnect.map(t => t.id));
      onTabsChange(prev => prev.map(t =>
        reconnectIds.has(t.id) ? { ...t, reconnecting: true } : t
      ));

      tabsToReconnect.forEach((tab, index) => {
        const timer = setTimeout(() => {
          reconnectTimersRef.current.delete(timer);
          const helpers = terminalWritersRef.current.get(tab.id);
          if (helpers) {
            const dims = helpers.fit();
            const cols = dims?.cols || 120;
            const rows = dims?.rows || 30;
            pendingReconnectsRef.current.add(tab.id);
            reconnectRef.current(tab.id, cols, rows);
          }
        }, index * 150);
        reconnectTimersRef.current.add(timer);
      });
    }, [onTabsChange, onActiveTabChange]),
  });

  // Keep reconnectRef pointing to the latest reconnect function
  reconnectRef.current = reconnect;

  // Load profiles on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/terminal/profiles`)
      .then((r) => r.json())
      .then(setProfiles)
      .catch(() => {
        setProfiles([{ id: 'default-shell', name: 'Shell', cwd: '{{workspace}}' }]);
      });
  }, []);

  // Close profile menu on outside click
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProfileMenu]);

  const spawnTerminal = useCallback((profile?: TerminalProfile) => {
    const id = generateTerminalId(profile?.name);
    const cwd = (profile?.cwd || '{{workspace}}').replace('{{workspace}}', workspacePath);
    const command = profile?.command;

    const newTab: TerminalTab = {
      id,
      title: profile?.name || 'Shell',
      cwd,
      command,
      profileName: profile?.name || 'Shell',
    };

    onTabsChange(prev => [...prev, newTab]);
    onActiveTabChange(id);
  }, [workspacePath, onTabsChange, onActiveTabChange]);

  const closeTab = useCallback((id: string) => {
    close(id);
    terminalWritersRef.current.delete(id);
    spawnedRef.current.delete(id);
    pendingReconnectsRef.current.delete(id);

    onTabsChange(prev => {
      const remaining = prev.filter((t) => t.id !== id);
      // Also update active tab if we're closing the active one
      onActiveTabChange(prevActive =>
        prevActive === id
          ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
          : prevActive
      );
      return remaining;
    });
  }, [close, onTabsChange, onActiveTabChange]);

  const handleTerminalReady = useCallback((terminalId: string, cwd: string, command: string | undefined, profileName: string | undefined, helpers: {
    write: (data: string | Uint8Array) => void;
    fit: () => { cols: number; rows: number } | null;
    focus: () => void;
    clear: () => void;
  }) => {
    terminalWritersRef.current.set(terminalId, helpers);

    // Spawn or reconnect on backend
    if (!spawnedRef.current.has(terminalId)) {
      const dims = helpers.fit();
      const cols = dims?.cols || 120;
      const rows = dims?.rows || 30;
      const requestId = crypto.randomUUID();
      spawn(terminalId, cwd, cols, rows, command, requestId, profileName);
    }
  }, [spawn]);

  const handleTerminalInput = useCallback((terminalId: string, data: string) => {
    sendInput(terminalId, data);
  }, [sendInput]);

  const handleTerminalResize = useCallback((terminalId: string, cols: number, rows: number) => {
    if (spawnedRef.current.has(terminalId)) {
      resize(terminalId, cols, rows);
    }
  }, [resize]);

  const handleTitleChange = useCallback((terminalId: string, title: string) => {
    onTabsChange(prev => prev.map((t) => (t.id === terminalId ? { ...t, title: title || t.title } : t)));
  }, [onTabsChange]);

  // Auto-spawn first terminal if none exist
  useEffect(() => {
    if (tabs.length === 0 && connected) {
      spawnTerminal();
    }
  }, [tabs.length, connected]); // Only on initial mount when connected

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--terminal-bg, var(--bg-primary))' }}>
      {/* Tab bar — relative + z-10 so profile dropdown paints above the terminal container */}
      <div
        className="flex items-center flex-shrink-0 relative z-10"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          minHeight: '36px',
          background: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(8px)',
          color: 'rgba(255, 255, 255, 0.7)',
        }}
      >
        {/* Scrollable tabs */}
        <div className="flex items-center overflow-x-auto min-w-0 flex-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer select-none min-w-0 max-w-[160px]"
              style={{
                backgroundColor: tab.id === activeTabId ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                borderBottom: tab.id === activeTabId ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab.id === activeTabId ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.55)',
              }}
              onClick={() => onActiveTabChange(tab.id)}
            >
              {tab.reconnecting ? (
                <span
                  className="flex-shrink-0 w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--accent, #f59e0b)', opacity: 0.8 }}
                  title="Reconnecting..."
                />
              ) : (
                <TerminalIcon size={12} className="flex-shrink-0" />
              )}
              <span className="truncate">{tab.reconnecting ? 'Reconnecting...' : tab.title}</span>
              <button
                className="w-4 h-4 flex items-center justify-center rounded flex-shrink-0 opacity-0 hover:opacity-100 group-hover:opacity-60"
                style={{ color: 'rgba(255, 255, 255, 0.6)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = ''; }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>

        {/* New terminal / profiles */}
        <div className="flex items-center flex-shrink-0 px-1 gap-0.5">
          <button
            onClick={() => spawnTerminal()}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ color: 'rgba(255, 255, 255, 0.55)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)';
            }}
            title="New terminal (Ctrl+Shift+T)"
          >
            <Plus size={14} />
          </button>

          {/* Profile menu */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-6 h-6 flex items-center justify-center rounded transition-colors"
              style={{ color: 'rgba(255, 255, 255, 0.55)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)';
              }}
              title="Terminal profiles"
            >
              <MoreVertical size={14} />
            </button>

            {showProfileMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded shadow-lg py-1 min-w-[180px]"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid var(--border)',
                }}
              >
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    className="w-full text-left px-3 py-1.5 text-sm transition-colors"
                    style={{ color: 'rgba(255, 255, 255, 0.9)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    onClick={() => {
                      spawnTerminal(profile);
                      setShowProfileMenu(false);
                    }}
                  >
                    {profile.name}
                    {profile.command && (
                      <span
                        className="block text-xs truncate"
                        style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                      >
                        {profile.command}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Close panel */}
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ color: 'rgba(255, 255, 255, 0.55)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)';
            }}
            title="Close terminal panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal instances -- all rendered, only active one visible */}
      <div className="flex-1 relative overflow-hidden" style={{ background: 'var(--terminal-bg, var(--bg-primary))' }}>
        {!connected && tabs.length === 0 && (
          <div className="flex items-center justify-center h-full" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
            <p className="text-sm">Connecting to backend...</p>
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
          >
            <Terminal
              terminalId={tab.id}
              visible={tab.id === activeTabId}
              fontSize={fontSize}
              onTitleChange={(title) => handleTitleChange(tab.id, title)}
              onReady={(helpers) => handleTerminalReady(tab.id, tab.cwd, tab.command, tab.profileName, helpers)}
              onInput={(data) => handleTerminalInput(tab.id, data)}
              onResize={(cols, rows) => handleTerminalResize(tab.id, cols, rows)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
