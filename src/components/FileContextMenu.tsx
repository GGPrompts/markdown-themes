import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { openInEditor } from '../lib/api';

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
  onCopyContent?: () => void;
  onSendToChat?: () => void;
  onArchive?: () => void;
  onResumeInChat?: () => void;
  isConversationFile?: boolean;
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
 * - **Send to Chat**: Send file content to AI Chat (files only)
 * - **Open in Editor**: Open file in VS Code via Go backend (files only)
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
  onCopyContent,
  onSendToChat,
  onArchive,
  onResumeInChat,
  isConversationFile,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Smart positioning - flip menu when near window edges
  // useLayoutEffect runs before paint, preventing visible position flash
  useLayoutEffect(() => {
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
      await openInEditor(filePath);
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

      {/* Copy Content - files only */}
      {isFile && onCopyContent && (
        <button
          className="context-menu-item"
          onClick={() => {
            onCopyContent();
            setTimeout(onClose, 150);
          }}
          style={menuItemStyle}
          onMouseEnter={handleMenuItemHover}
          onMouseLeave={handleMenuItemLeave}
        >
          <CopyIcon />
          <span>Copy Content</span>
        </button>
      )}

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

          {onSendToChat && <div style={dividerStyle} />}

          {/* Open in Editor */}
          <button
            className="context-menu-item"
            onClick={handleOpenInEditor}
            style={menuItemStyle}
            onMouseEnter={handleMenuItemHover}
            onMouseLeave={handleMenuItemLeave}
          >
            <EditIcon />
            <span>Open in Editor</span>
          </button>

          {/* Conversation file actions */}
          {isConversationFile && (onArchive || onResumeInChat) && (
            <>
              <div style={dividerStyle} />
              {onResumeInChat && (
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onResumeInChat();
                    onClose();
                  }}
                  style={menuItemStyle}
                  onMouseEnter={handleMenuItemHover}
                  onMouseLeave={handleMenuItemLeave}
                >
                  <ResumeIcon />
                  <span>Resume in Chat</span>
                </button>
              )}
              {onArchive && (
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onArchive();
                    onClose();
                  }}
                  style={menuItemStyle}
                  onMouseEnter={handleMenuItemHover}
                  onMouseLeave={handleMenuItemLeave}
                >
                  <ArchiveIcon />
                  <span>Archive Conversation</span>
                </button>
              )}
            </>
          )}
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

function ArchiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  );
}

