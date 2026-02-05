import { useRef, useEffect, useState } from 'react';
import { getAuthToken } from '../lib/api';

interface FileContextMenuProps {
  show: boolean;
  x: number;
  y: number;
  filePath: string;
  fileName: string;
  isDirectory: boolean;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: () => void;
  onSendToChat?: () => void;
  onPasteToTerminal?: () => void;
  onReadAloud?: () => void;
  isLoadingAudio?: boolean;
}

const API_BASE = 'http://localhost:8130';

/**
 * Escape a string for safe use in a shell command.
 * Uses single quotes and escapes any single quotes within the string.
 */
function escapeShellArg(arg: string): string {
  // Single quotes prevent all shell expansion except for single quotes themselves
  // Replace ' with '\'' (end quote, escaped quote, start quote)
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * FileContextMenu - Right-click context menu for file tree items
 *
 * Provides file/folder operations when right-clicking in the file tree.
 * Uses smart positioning to stay within window bounds.
 *
 * Available actions:
 * - **Copy Path**: Copy the file/folder path to clipboard
 * - **Copy @Path**: Copy path with @ prefix (for Claude references)
 * - **Toggle Favorite**: Add/remove from favorites
 * - **Send to Chat**: Queue file content to TabzChrome sidebar chat (files only)
 * - **Paste to Terminal**: Paste file content directly to active terminal (files only)
 * - **Read Aloud**: TTS playback of file content (files only)
 * - **Edit**: Open file in $EDITOR via TabzChrome spawn API (files only)
 */
export function FileContextMenu({
  show,
  x,
  y,
  filePath,
  fileName,
  isDirectory,
  isFavorite,
  onClose,
  onToggleFavorite,
  onSendToChat,
  onPasteToTerminal,
  onReadAloud,
  isLoadingAudio,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Smart positioning - flip menu when near window edges
  useEffect(() => {
    if (show && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const padding = 8;

      let adjustedX = x;
      let adjustedY = y;

      // Flip horizontally if menu would overflow right edge
      if (x + menuRect.width + padding > window.innerWidth) {
        adjustedX = x - menuRect.width;
      }

      // Flip vertically if menu would overflow bottom edge
      if (y + menuRect.height + padding > window.innerHeight) {
        adjustedY = y - menuRect.height;
      }

      // Ensure menu doesn't go off left/top edges
      adjustedX = Math.max(padding, adjustedX);
      adjustedY = Math.max(padding, adjustedY);

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [show, x, y]);

  // Close on click outside or Escape key
  useEffect(() => {
    if (!show) return;

    let mounted = true;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Use setTimeout to avoid immediately closing from the same click that opened it
    const timeoutId = setTimeout(() => {
      if (mounted) {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
      }
    }, 0);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [show, onClose]);

  // Clear copy feedback after delay
  useEffect(() => {
    if (copyFeedback) {
      const timer = setTimeout(() => setCopyFeedback(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [copyFeedback]);

  if (!show) return null;

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(filePath);
      setCopyFeedback('Copied!');
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  };

  const handleCopyAtPath = async () => {
    try {
      await navigator.clipboard.writeText(`@${filePath}`);
      setCopyFeedback('Copied!');
    } catch (err) {
      console.error('Failed to copy @path:', err);
    }
  };

  const handleOpenInEditor = async () => {
    try {
      const token = await getAuthToken();
      // Use $EDITOR on the server side - the spawn command will inherit the environment
      // This spawns a terminal that runs: $EDITOR "filepath" (falls back to nano if EDITOR not set)
      await fetch(`${API_BASE}/api/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token,
        },
        body: JSON.stringify({
          name: `Edit: ${fileName}`,
          command: `\${EDITOR:-nano} ${escapeShellArg(filePath)}`,
        }),
      });
      onClose();
    } catch (err) {
      console.error('Failed to open in editor:', err);
    }
  };

  const isFile = !isDirectory;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 10000,
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
        minWidth: '160px',
        padding: '4px 0',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Copy Path */}
      <button
        className="context-menu-item"
        onClick={() => {
          handleCopyPath();
          setTimeout(onClose, 150);
        }}
        style={menuItemStyle}
        onMouseEnter={handleMenuItemHover}
        onMouseLeave={handleMenuItemLeave}
      >
        <CopyIcon />
        <span>Copy Path</span>
        {copyFeedback && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--accent)' }}>{copyFeedback}</span>}
      </button>

      {/* Copy @Path */}
      <button
        className="context-menu-item"
        onClick={() => {
          handleCopyAtPath();
          setTimeout(onClose, 150);
        }}
        style={menuItemStyle}
        onMouseEnter={handleMenuItemHover}
        onMouseLeave={handleMenuItemLeave}
      >
        <AtSignIcon />
        <span>Copy @Path</span>
      </button>

      <div style={dividerStyle} />

      {/* Toggle Favorite */}
      <button
        className="context-menu-item"
        onClick={() => {
          onToggleFavorite();
          onClose();
        }}
        style={menuItemStyle}
        onMouseEnter={handleMenuItemHover}
        onMouseLeave={handleMenuItemLeave}
      >
        <StarIcon filled={isFavorite} />
        <span>{isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
      </button>

      {/* File-only actions */}
      {isFile && (
        <>
          <div style={dividerStyle} />

          {/* Send to Chat */}
          {onSendToChat && (
            <button
              className="context-menu-item"
              onClick={() => {
                onSendToChat();
                onClose();
              }}
              style={menuItemStyle}
              onMouseEnter={handleMenuItemHover}
              onMouseLeave={handleMenuItemLeave}
            >
              <SendIcon />
              <span>Send to Chat</span>
            </button>
          )}

          {/* Paste to Terminal */}
          {onPasteToTerminal && (
            <button
              className="context-menu-item"
              onClick={() => {
                onPasteToTerminal();
                onClose();
              }}
              style={menuItemStyle}
              onMouseEnter={handleMenuItemHover}
              onMouseLeave={handleMenuItemLeave}
            >
              <TerminalIcon />
              <span>Paste to Terminal</span>
            </button>
          )}

          {/* Read Aloud */}
          {onReadAloud && (
            <button
              className="context-menu-item"
              onClick={() => {
                if (!isLoadingAudio) {
                  onReadAloud();
                  // Don't close - let user see loading state
                }
              }}
              style={{
                ...menuItemStyle,
                opacity: isLoadingAudio ? 0.5 : 1,
                cursor: isLoadingAudio ? 'wait' : 'pointer',
              }}
              onMouseEnter={handleMenuItemHover}
              onMouseLeave={handleMenuItemLeave}
              disabled={isLoadingAudio}
            >
              {isLoadingAudio ? <LoadingIcon /> : <VolumeIcon />}
              <span>{isLoadingAudio ? 'Loading...' : 'Read Aloud'}</span>
            </button>
          )}

          {(onSendToChat || onPasteToTerminal || onReadAloud) && <div style={dividerStyle} />}

          {/* Edit */}
          <button
            className="context-menu-item"
            onClick={handleOpenInEditor}
            style={menuItemStyle}
            onMouseEnter={handleMenuItemHover}
            onMouseLeave={handleMenuItemLeave}
          >
            <EditIcon />
            <span>Edit</span>
          </button>
        </>
      )}
    </div>
  );
}

// Styles
const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '8px 12px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: '0.875rem',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background-color 0.15s',
};

const dividerStyle: React.CSSProperties = {
  height: '1px',
  backgroundColor: 'var(--border)',
  margin: '4px 0',
};

const handleMenuItemHover = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent) 15%, transparent)';
};

const handleMenuItemLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.backgroundColor = 'transparent';
};

// Icons
function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function AtSignIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: filled ? 'var(--accent)' : 'currentColor' }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}
