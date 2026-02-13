import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X, MoreVertical, Terminal as TerminalIcon, Pencil, Trash2, Minus, Type, FolderOpen } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Terminal } from './Terminal';
import { FilePickerModal } from './FilePickerModal';
import { useTerminal, type TerminalTab, type RecoveredSession, type TerminalListResponse } from '../hooks/useTerminal';
import { sanitizeProfileName, generateTerminalId, generateProfileId } from '../utils/terminalUtils';
import type { ThemeId } from '../themes';

const API_BASE = 'http://localhost:8130';

interface TerminalProfile {
  id: string;
  name: string;
  command?: string;
  cwd?: string;
}

const FONT_FAMILY_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'JetBrains Mono NF', label: 'JetBrains Mono NF' },
  { value: 'Fira Code NF', label: 'Fira Code NF' },
  { value: 'CaskaydiaCove NF', label: 'CaskaydiaCove NF' },
];

interface TerminalPanelProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  workspacePath: string;
  fontSize?: number;
  themeId?: ThemeId;
  onTabsChange: React.Dispatch<React.SetStateAction<TerminalTab[]>>;
  onActiveTabChange: React.Dispatch<React.SetStateAction<string | null>>;
  onClose: () => void;
}

// --- Profile Editor Modal ---

interface ProfileEditorProps {
  profile: TerminalProfile | null; // null = new profile
  onSave: (profile: TerminalProfile) => void;
  onCancel: () => void;
}

function ProfileEditor({ profile, onSave, onCancel }: ProfileEditorProps) {
  const [name, setName] = useState(profile?.name || '');
  const [command, setCommand] = useState(profile?.command || '');
  const [cwd, setCwd] = useState(profile?.cwd || '');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave({
      id: profile?.id || generateProfileId(trimmedName),
      name: trimmedName,
      command: command.trim() || undefined,
      cwd: cwd.trim() || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '12px',
    marginBottom: '4px',
    display: 'block',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="rounded-lg shadow-2xl"
        style={{
          backgroundColor: 'rgba(20, 20, 25, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          width: '380px',
          maxWidth: '90vw',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}
        >
          <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '14px', fontWeight: 500 }}>
            {profile ? 'Edit Profile' : 'New Profile'}
          </span>
          <button
            onClick={onCancel}
            className="w-6 h-6 flex items-center justify-center rounded"
            style={{ color: 'rgba(255, 255, 255, 0.5)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <div className="px-4 py-3 flex flex-col gap-3">
          {/* Name */}
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Profile"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent, #64ffda)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
            />
          </div>

          {/* Command */}
          <div>
            <label style={labelStyle}>Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="bash"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent, #64ffda)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
            />
          </div>

          {/* Working directory */}
          <div>
            <label style={labelStyle}>Working directory</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="Current workspace"
                style={{ ...inputStyle, flex: 1 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent, #64ffda)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
              />
              <button
                type="button"
                onClick={() => setShowFolderPicker(true)}
                className="flex items-center justify-center rounded flex-shrink-0"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  width: '34px',
                  height: '34px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                }}
                title="Browse folders"
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div
          className="px-4 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
        >
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm"
            style={{
              color: 'rgba(255, 255, 255, 0.7)',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'; }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-3 py-1.5 rounded text-sm font-medium"
            style={{
              backgroundColor: name.trim() ? 'var(--accent, #64ffda)' : 'rgba(255, 255, 255, 0.1)',
              color: name.trim() ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.3)',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
            onMouseEnter={(e) => {
              if (name.trim()) e.currentTarget.style.opacity = '0.85';
            }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Save
          </button>
        </div>
      </div>
      {showFolderPicker && (
        <FilePickerModal
          mode="folder"
          title="Select Working Directory"
          initialPath={cwd || undefined}
          onSelect={(path) => {
            setCwd(path);
            setShowFolderPicker(false);
          }}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}
    </div>,
    document.body
  );
}

// --- Main Panel ---

export function TerminalPanel({
  tabs,
  activeTabId,
  workspacePath,
  fontSize = 14,
  themeId,
  onTabsChange,
  onActiveTabChange,
  onClose,
}: TerminalPanelProps) {
  const [profiles, setProfiles] = useState<TerminalProfile[]>([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [globalFontFamily, setGlobalFontFamily] = useState('');
  const [globalFontSize, setGlobalFontSize] = useState(fontSize);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const [editingProfile, setEditingProfile] = useState<TerminalProfile | null>(null);
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

  // Track whether backend recovery has completed (gates auto-spawn of first terminal)
  const [recoveryDone, setRecoveryDone] = useState(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Ref to current tabs for use in onConnected callback
  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of reconnectTimersRef.current) {
        clearTimeout(timer);
      }
      reconnectTimersRef.current.clear();
      clearTimeout(recoveryTimerRef.current);
    };
  }, []);

  // Ref to the reconnect function -- populated after useTerminal returns.
  // This breaks the circular dependency where onConnected needs reconnect
  // but reconnect comes from the same useTerminal call.
  const reconnectRef = useRef<(id: string, cols: number, rows: number) => void>(() => {});
  const listSessionsRef = useRef<() => void>(() => {});

  const { connected, spawn, reconnect, sendInput, resize, close, listSessions } = useTerminal({
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
      } else if (error.includes('duplicate spawn')) {
        // Dedup rejection — the backend already has this session from a prior
        // spawn attempt (e.g. StrictMode double-fire). The optimistic add to
        // spawnedRef is correct; just ignore the error.
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
        // Request session list from backend so we can discover orphaned mt-* sessions
        // (the startup recovery broadcast may have already fired before we connected)
        listSessionsRef.current();
        // Set a timeout fallback: if backend doesn't respond
        // within 3s, consider recovery done so auto-spawn can proceed
        recoveryTimerRef.current = setTimeout(() => setRecoveryDone(true), 3000);
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
      clearTimeout(recoveryTimerRef.current);
      setRecoveryDone(true);

      const currentTabs = tabsRef.current;
      const recoveredIds = new Set(recoveredSessions.map(s => s.id));

      // If we have no tabs but backend found orphaned mt-* tmux sessions,
      // create tabs for them so the user gets their terminals back
      if (currentTabs.length === 0 && recoveredSessions.length > 0) {
        const newTabs: TerminalTab[] = recoveredSessions.map(s => {
          // Extract a friendly title from the session ID (e.g. "mt-shell-abc123" → "Shell")
          const parts = s.id.replace(/^mt-/, '').split('-');
          parts.pop(); // remove the random suffix
          const title = parts.length > 0
            ? parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
            : 'Shell';
          return {
            id: s.id,
            title,
            cwd: s.cwd || workspacePath,
            tmuxSession: s.id,
            reconnecting: true,
          };
        });
        onTabsChange(newTabs);
        onActiveTabChange(newTabs[0].id);
        // Terminal components will mount and handleTerminalReady will see
        // tmuxSession on each tab, triggering reconnect instead of spawn
        return;
      }

      if (currentTabs.length === 0) return;

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
    }, [onTabsChange, onActiveTabChange, workspacePath]),
    onTerminalList: useCallback((data: TerminalListResponse) => {
      // Treat the terminal-list response like recovery: combine active sessions
      // and orphans into a single list of sessions to recover
      clearTimeout(recoveryTimerRef.current);
      setRecoveryDone(true);

      const currentTabs = tabsRef.current;
      const allSessionIds = new Set([
        ...data.active.map(s => s.id),
        ...data.orphans,
      ]);

      // If we have tabs from sessionStorage, they'll reconnect via handleTerminalReady.
      // But if we have no tabs and backend has sessions, create tabs for them.
      if (currentTabs.length === 0 && allSessionIds.size > 0) {
        const newTabs: TerminalTab[] = [];
        for (const s of data.active) {
          const parts = s.id.replace(/^mt-/, '').split('-');
          parts.pop();
          const title = parts.length > 0
            ? parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
            : 'Shell';
          newTabs.push({
            id: s.id,
            title,
            cwd: s.cwd || workspacePath,
            tmuxSession: s.tmuxSession || s.id,
            reconnecting: true,
          });
        }
        for (const orphanId of data.orphans) {
          // Skip if already added from active
          if (newTabs.some(t => t.id === orphanId)) continue;
          const parts = orphanId.replace(/^mt-/, '').split('-');
          parts.pop();
          const title = parts.length > 0
            ? parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
            : 'Shell';
          newTabs.push({
            id: orphanId,
            title,
            cwd: workspacePath,
            tmuxSession: orphanId,
            reconnecting: true,
          });
        }
        if (newTabs.length > 0) {
          onTabsChange(newTabs);
          onActiveTabChange(newTabs[0].id);
        }
      } else if (currentTabs.length > 0) {
        // Remove stale tabs whose sessions no longer exist
        const staleTabs = currentTabs.filter(tab =>
          !allSessionIds.has(tab.id) && !spawnedRef.current.has(tab.id)
        );
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
      }
    }, [onTabsChange, onActiveTabChange, workspacePath]),
  });

  // Keep reconnectRef pointing to the latest reconnect function
  reconnectRef.current = reconnect;
  listSessionsRef.current = listSessions;

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

  // Close font menu on outside click
  useEffect(() => {
    if (!showFontMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (fontMenuRef.current && !fontMenuRef.current.contains(e.target as Node)) {
        setShowFontMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFontMenu]);

  const saveProfilesToBackend = useCallback((updatedProfiles: TerminalProfile[]) => {
    setProfiles(updatedProfiles);
    fetch(`${API_BASE}/api/terminal/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProfiles),
    }).catch((err) => console.error('[TerminalPanel] Failed to save profiles:', err));
  }, []);

  const handleProfileSave = useCallback((savedProfile: TerminalProfile) => {
    const existing = profiles.find((p) => p.id === savedProfile.id);
    let updated: TerminalProfile[];
    if (existing) {
      updated = profiles.map((p) => (p.id === savedProfile.id ? savedProfile : p));
    } else {
      updated = [...profiles, savedProfile];
    }
    saveProfilesToBackend(updated);
    setShowProfileEditor(false);
    setEditingProfile(null);
  }, [profiles, saveProfilesToBackend]);

  const handleProfileDelete = useCallback((profileId: string) => {
    const updated = profiles.filter((p) => p.id !== profileId);
    // Ensure at least one profile remains
    if (updated.length === 0) {
      updated.push({ id: 'default-shell', name: 'Shell', cwd: '{{workspace}}' });
    }
    saveProfilesToBackend(updated);
  }, [profiles, saveProfilesToBackend]);

  const openNewProfile = useCallback(() => {
    setEditingProfile(null);
    setShowProfileEditor(true);
    setShowProfileMenu(false);
  }, []);

  const openEditProfile = useCallback((profile: TerminalProfile) => {
    setEditingProfile(profile);
    setShowProfileEditor(true);
    setShowProfileMenu(false);
  }, []);

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

    // Spawn or reconnect on backend.
    // Add to spawnedRef optimistically BEFORE sending to prevent StrictMode
    // double-fires: the Terminal init effect runs twice (mount → cleanup →
    // remount) and the second onReady would re-send spawn before the backend
    // confirms the first, bypassing dedup and triggering a supersession race.
    if (!spawnedRef.current.has(terminalId)) {
      spawnedRef.current.add(terminalId);
      const dims = helpers.fit();
      const cols = dims?.cols || 120;
      const rows = dims?.rows || 30;

      // If this tab has a tmuxSession (restored from sessionStorage), reconnect
      // to the existing tmux session instead of spawning a new one
      const tab = tabsRef.current.find(t => t.id === terminalId);
      if (tab?.tmuxSession) {
        pendingReconnectsRef.current.add(terminalId);
        onTabsChange(prev => prev.map(t =>
          t.id === terminalId ? { ...t, reconnecting: true } : t
        ));
        reconnectRef.current(terminalId, cols, rows);
      } else {
        const requestId = crypto.randomUUID();
        spawn(terminalId, cwd, cols, rows, command, requestId, profileName);
      }
    }
  }, [spawn, onTabsChange]);

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

  // Auto-spawn first terminal on initial connect only (not when user closes all tabs)
  // Waits for recovery to complete so we don't spawn a new terminal over orphaned sessions
  const hasSpawnedInitialRef = useRef(false);
  useEffect(() => {
    if (tabs.length === 0 && connected && recoveryDone && !hasSpawnedInitialRef.current) {
      hasSpawnedInitialRef.current = true;
      spawnTerminal();
    }
  }, [tabs.length, connected, recoveryDone]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--terminal-bg, var(--bg-primary))' }}>
      {/* Tab bar -- relative + z-10 so profile dropdown paints above the terminal container */}
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
                className="absolute right-0 top-full mt-1 z-50 rounded shadow-lg py-1 min-w-[220px]"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid var(--border)',
                }}
              >
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="group flex items-center text-sm transition-colors"
                    style={{ color: 'rgba(255, 255, 255, 0.9)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <button
                      className="flex-1 text-left px-3 py-1.5 min-w-0"
                      onClick={() => {
                        spawnTerminal(profile);
                        setShowProfileMenu(false);
                      }}
                    >
                      <span className="block truncate">{profile.name}</span>
                      {profile.command && (
                        <span
                          className="block text-xs truncate"
                          style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                        >
                          {profile.command}
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded"
                        style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditProfile(profile);
                        }}
                        title="Edit profile"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded"
                        style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProfileDelete(profile.id);
                        }}
                        title="Delete profile"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Divider + New Profile */}
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', margin: '4px 0' }} />
                <button
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors"
                  style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}
                  onClick={openNewProfile}
                >
                  <Plus size={12} />
                  New Profile
                </button>
              </div>
            )}
          </div>

          {/* Font settings */}
          <div className="relative" ref={fontMenuRef}>
            <button
              onClick={() => setShowFontMenu(!showFontMenu)}
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
              title="Font settings"
            >
              <Type size={13} />
            </button>

            {showFontMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded shadow-lg py-2 px-3"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid var(--border)',
                  minWidth: '200px',
                }}
              >
                {/* Font size */}
                <div className="flex items-center justify-between mb-2">
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px' }}>Size</span>
                  <div className="flex items-center gap-1">
                    <button
                      className="w-5 h-5 flex items-center justify-center rounded"
                      style={{ color: 'rgba(255, 255, 255, 0.7)', backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'; }}
                      onClick={() => setGlobalFontSize(s => Math.max(8, s - 1))}
                    >
                      <Minus size={10} />
                    </button>
                    <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '12px', minWidth: '24px', textAlign: 'center' }}>
                      {globalFontSize}
                    </span>
                    <button
                      className="w-5 h-5 flex items-center justify-center rounded"
                      style={{ color: 'rgba(255, 255, 255, 0.7)', backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'; }}
                      onClick={() => setGlobalFontSize(s => Math.min(32, s + 1))}
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>

                {/* Font family */}
                <div>
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Font</span>
                  {FONT_FAMILY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className="w-full text-left px-2 py-1 text-xs rounded transition-colors"
                      style={{
                        color: (globalFontFamily || '') === opt.value ? 'var(--accent, #64ffda)' : 'rgba(255, 255, 255, 0.8)',
                        backgroundColor: (globalFontFamily || '') === opt.value ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = (globalFontFamily || '') === opt.value ? 'rgba(255, 255, 255, 0.08)' : 'transparent';
                      }}
                      onClick={() => setGlobalFontFamily(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
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
              themeId={themeId}
              fontSize={globalFontSize}
              fontFamily={globalFontFamily || undefined}
              onTitleChange={(title) => handleTitleChange(tab.id, title)}
              onReady={(helpers) => handleTerminalReady(tab.id, tab.cwd, tab.command, tab.profileName, helpers)}
              onInput={(data) => handleTerminalInput(tab.id, data)}
              onResize={(cols, rows) => handleTerminalResize(tab.id, cols, rows)}
            />
          </div>
        ))}
      </div>

      {/* Profile editor modal */}
      {showProfileEditor && (
        <ProfileEditor
          profile={editingProfile}
          onSave={handleProfileSave}
          onCancel={() => {
            setShowProfileEditor(false);
            setEditingProfile(null);
          }}
        />
      )}
    </div>
  );
}
