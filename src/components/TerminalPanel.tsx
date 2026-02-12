import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X, MoreVertical, Terminal as TerminalIcon } from 'lucide-react';
import { Terminal } from './Terminal';
import { useTerminal, type TerminalTab } from '../hooks/useTerminal';

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

function generateTerminalId(): string {
  return `mt-${Date.now().toString(36)}`;
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

  // Map of terminalId → write function (set when Terminal calls onReady)
  const terminalWritersRef = useRef<Map<string, {
    write: (data: string | Uint8Array) => void;
    fit: () => { cols: number; rows: number } | null;
    focus: () => void;
    clear: () => void;
  }>>(new Map());

  // Track which terminals have been spawned on the backend
  const spawnedRef = useRef<Set<string>>(new Set());

  const { connected, spawn, sendInput, resize, close } = useTerminal({
    onOutput: useCallback((terminalId: string, data: string | Uint8Array) => {
      const helpers = terminalWritersRef.current.get(terminalId);
      if (helpers) {
        helpers.write(data);
      }
    }, []),
    onSpawned: useCallback((info: { terminalId: string; cwd: string }) => {
      spawnedRef.current.add(info.terminalId);
    }, []),
    onClosed: useCallback((terminalId: string) => {
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
    }, [onTabsChange, onActiveTabChange]),
    onError: useCallback((terminalId: string, error: string) => {
      console.error(`[Terminal] Error for ${terminalId}:`, error);
    }, []),
  });

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
    const id = generateTerminalId();
    const cwd = (profile?.cwd || '{{workspace}}').replace('{{workspace}}', workspacePath);
    const command = profile?.command;

    const newTab: TerminalTab = {
      id,
      title: profile?.name || 'Shell',
      cwd,
      command,
    };

    onTabsChange(prev => [...prev, newTab]);
    onActiveTabChange(id);
  }, [workspacePath, onTabsChange, onActiveTabChange]);

  const closeTab = useCallback((id: string) => {
    close(id);
    terminalWritersRef.current.delete(id);
    spawnedRef.current.delete(id);

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

  const handleTerminalReady = useCallback((terminalId: string, cwd: string, command: string | undefined, helpers: {
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
      spawn(terminalId, cwd, cols, rows, command);
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
      {/* Tab bar */}
      <div
        className="flex items-center overflow-x-auto flex-shrink-0"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          minHeight: '36px',
          background: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(8px)',
          color: 'rgba(255, 255, 255, 0.7)',
        }}
      >
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
            <TerminalIcon size={12} className="flex-shrink-0" />
            <span className="truncate">{tab.title}</span>
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

        {/* New terminal / profiles */}
        <div className="flex items-center ml-auto flex-shrink-0 px-1 gap-0.5">
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

      {/* Terminal instances — all rendered, only active one visible */}
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
              onReady={(helpers) => handleTerminalReady(tab.id, tab.cwd, tab.command, helpers)}
              onInput={(data) => handleTerminalInput(tab.id, data)}
              onResize={(cols, rows) => handleTerminalResize(tab.id, cols, rows)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
