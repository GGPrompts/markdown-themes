import { useState, useRef, useEffect } from 'react';
import { Columns, Copy, AtSign, MessageSquare, Check, GitBranch, GitPullRequestDraft, Keyboard, Crosshair } from 'lucide-react';
import { queueToChat } from '../lib/api';

interface ToolbarProps {
  currentFile: string | null;
  isStreaming?: boolean;
  connected?: boolean;
  recentFiles?: string[];
  fontSize?: number;
  isSplit?: boolean;
  isGitGraph?: boolean;
  isWorkingTree?: boolean;
  isFollowMode?: boolean;
  content?: string;
  workspacePath?: string | null;
  onFileSelect: (path: string) => void;
  onFontSizeChange?: (size: number) => void;
  onSplitToggle?: () => void;
  onGitGraphToggle?: () => void;
  onWorkingTreeToggle?: () => void;
  onFollowModeToggle?: () => void;
  onHotkeysClick?: () => void;
}

export function Toolbar({
  currentFile,
  isStreaming,
  connected = false,
  recentFiles = [],
  fontSize = 100,
  isSplit = false,
  isGitGraph = false,
  isWorkingTree = false,
  isFollowMode = false,
  content,
  workspacePath,
  onFileSelect,
  onFontSizeChange,
  onSplitToggle,
  onGitGraphToggle,
  onWorkingTreeToggle,
  onFollowModeToggle,
  onHotkeysClick,
}: ToolbarProps) {
  const [showRecentFiles, setShowRecentFiles] = useState(false);
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const [copiedState, setCopiedState] = useState<'content' | 'path' | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowRecentFiles(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (showPathInput && pathInputRef.current) {
      pathInputRef.current.focus();
    }
  }, [showPathInput]);

  const handleOpenFile = () => {
    setPathInputValue('');
    setShowPathInput(true);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathInputValue.trim()) return;
    onFileSelect(pathInputValue.trim());
    setShowPathInput(false);
    setPathInputValue('');
  };

  const handleRecentFileClick = (path: string) => {
    onFileSelect(path);
    setShowRecentFiles(false);
  };

  const getFileName = (path: string) => path.split('/').pop() ?? path.split('\\').pop() ?? path;
  const fileName = currentFile ? getFileName(currentFile) : null;

  // Get relative path for @path format
  const getRelativePath = (filePath: string) => {
    if (workspacePath && filePath.startsWith(workspacePath)) {
      const relative = filePath.slice(workspacePath.length);
      return relative.startsWith('/') ? relative.slice(1) : relative;
    }
    // Fallback: use filename only
    return getFileName(filePath);
  };

  // Copy content to clipboard
  const handleCopyContent = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedState('content');
      setTimeout(() => setCopiedState(null), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
      // TODO: Show user notification (toast) when clipboard copy fails
    }
  };

  // Copy @path format to clipboard
  const handleCopyPath = async () => {
    if (!currentFile) return;
    const relativePath = getRelativePath(currentFile);
    const atPath = `@${relativePath}`;
    try {
      await navigator.clipboard.writeText(atPath);
      setCopiedState('path');
      setTimeout(() => setCopiedState(null), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
      // TODO: Show user notification (toast) when clipboard copy fails
    }
  };

  // Send content to TabzChrome sidepanel chat
  const handleSendToChat = async () => {
    if (!content) return;
    try {
      await queueToChat(content);
    } catch (err) {
      console.error('Failed to send to chat:', err);
      // TODO: Show user notification (toast) when chat send fails
    }
  };

  return (
    <>
      <header
        className="flex items-center justify-between px-4 py-3 select-none relative z-20"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-4">
          {/* Connection status dot - subtle indicator */}
          {currentFile && (
            <span
              className="w-2 h-2 rounded-full transition-colors"
              style={{
                backgroundColor: connected ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
              }}
              title={connected ? 'Connected to TabzChrome' : 'Disconnected from TabzChrome'}
            />
          )}

          <div className="relative" ref={dropdownRef}>
            <div className="flex">
              <button
                type="button"
                onClick={handleOpenFile}
                className="btn-accent px-4 py-1.5 font-medium text-sm transition-colors"
                style={{
                  borderRadius:
                    recentFiles.length > 0 ? 'var(--radius) 0 0 var(--radius)' : 'var(--radius)',
                }}
              >
                Open File
              </button>
              {recentFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowRecentFiles(!showRecentFiles)}
                  className="btn-accent px-2 py-1.5 transition-colors"
                  style={{
                    borderRadius: '0 var(--radius) var(--radius) 0',
                    borderLeft: '1px solid rgba(255,255,255,0.2)',
                  }}
                  title="Recent files"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              )}
            </div>

            {showRecentFiles && recentFiles.length > 0 && (
              <div
                className="absolute top-full left-0 mt-1 z-[100] min-w-[280px] max-w-[400px] py-1 overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -4px rgba(0, 0, 0, 0.15)',
                }}
              >
                <div
                  className="px-3 py-1.5 text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}
                >
                  Recent Files
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {recentFiles.map((path) => (
                    <button
                      type="button"
                      key={path}
                      onClick={() => handleRecentFileClick(path)}
                      className="w-full px-3 py-2 text-left text-sm transition-colors flex flex-col gap-0.5 hover:bg-[var(--bg-primary)]"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <span className="font-medium truncate">{getFileName(path)}</span>
                      <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {path}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {fileName && (
            <span
              className="text-sm truncate max-w-[300px]"
              style={{ color: 'var(--text-secondary)' }}
              title={currentFile ?? ''}
            >
              {fileName}
            </span>
          )}

          {isStreaming && (
            <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent)' }}>
              <span className="relative flex h-2 w-2">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: 'var(--accent)' }}
                ></span>
                <span
                  className="relative inline-flex rounded-full h-2 w-2"
                  style={{ backgroundColor: 'var(--accent)' }}
                ></span>
              </span>
              AI writing...
            </span>
          )}

          {/* Action buttons */}
          {currentFile && (
            <div className="flex items-center gap-1">
              {/* Copy content button */}
              <button
                type="button"
                onClick={handleCopyContent}
                disabled={!content}
                className="w-8 h-8 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--bg-primary)',
                  color: copiedState === 'content' ? 'var(--accent)' : 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
                title="Copy file content"
              >
                {copiedState === 'content' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>

              {/* Copy @path button */}
              <button
                type="button"
                onClick={handleCopyPath}
                className="w-8 h-8 flex items-center justify-center transition-colors"
                style={{
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--bg-primary)',
                  color: copiedState === 'path' ? 'var(--accent)' : 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
                title={`Copy @path for Claude (e.g., @${currentFile ? getRelativePath(currentFile) : 'file.md'})`}
              >
                {copiedState === 'path' ? <Check className="w-4 h-4" /> : <AtSign className="w-4 h-4" />}
              </button>

              {/* Send to chat button */}
              <button
                type="button"
                onClick={handleSendToChat}
                disabled={!content}
                className="w-8 h-8 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
                title="Send content to TabzChrome chat"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Follow streaming mode toggle */}
          <button
            type="button"
            onClick={onFollowModeToggle}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: isFollowMode ? 'var(--accent)' : 'var(--bg-primary)',
              color: isFollowMode ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title={isFollowMode ? 'Stop following AI edits' : 'Follow AI edits (auto-open streaming files)'}
          >
            <Crosshair className="w-4 h-4" />
          </button>

          {/* Git graph toggle */}
          <button
            type="button"
            onClick={onGitGraphToggle}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: isGitGraph ? 'var(--accent)' : 'var(--bg-primary)',
              color: isGitGraph ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title={isGitGraph ? 'Close git graph (Ctrl+G)' : 'Show git graph (Ctrl+G)'}
          >
            <GitBranch className="w-4 h-4" />
          </button>

          {/* Working tree toggle */}
          <button
            type="button"
            onClick={onWorkingTreeToggle}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: isWorkingTree ? 'var(--accent)' : 'var(--bg-primary)',
              color: isWorkingTree ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title={isWorkingTree ? 'Close working tree (Ctrl+Shift+G)' : 'Show working tree (Ctrl+Shift+G)'}
          >
            <GitPullRequestDraft className="w-4 h-4" />
          </button>

          {/* Split view toggle */}
          <button
            type="button"
            onClick={onSplitToggle}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: isSplit ? 'var(--accent)' : 'var(--bg-primary)',
              color: isSplit ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title={isSplit ? 'Close split view' : 'Open split view'}
          >
            <Columns className="w-4 h-4" />
          </button>

          {/* Keyboard shortcuts help */}
          <button
            type="button"
            onClick={onHotkeysClick}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title="Keyboard shortcuts"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          {/* Font size controls */}
          <div className="flex items-center gap-1">
            <span className="text-sm mr-1" style={{ color: 'var(--text-secondary)' }}>
              Size:
            </span>
            <button
              type="button"
              onClick={() => onFontSizeChange?.(Math.max(50, fontSize - 10))}
              className="w-7 h-7 flex items-center justify-center text-sm font-medium transition-colors"
              style={{
                borderRadius: 'var(--radius) 0 0 var(--radius)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              title="Decrease font size"
            >
              -
            </button>
            <span
              className="w-12 h-7 flex items-center justify-center text-xs"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {fontSize}%
            </span>
            <button
              type="button"
              onClick={() => onFontSizeChange?.(Math.min(200, fontSize + 10))}
              className="w-7 h-7 flex items-center justify-center text-sm font-medium transition-colors"
              style={{
                borderRadius: '0 var(--radius) var(--radius) 0',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              title="Increase font size"
            >
              +
            </button>
          </div>
        </div>
      </header>

      {/* Path Input Modal */}
      {showPathInput && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setShowPathInput(false)}
        >
          <div
            className="w-full max-w-lg p-6 shadow-xl"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-lg font-medium mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Open File
            </h2>
            <form onSubmit={handlePathSubmit}>
              <input
                ref={pathInputRef}
                type="text"
                value={pathInputValue}
                onChange={(e) => setPathInputValue(e.target.value)}
                placeholder="/path/to/file.md"
                className="w-full px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowPathInput(false)}
                  className="btn-secondary px-4 py-1.5 text-sm"
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-accent px-4 py-1.5 text-sm"
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  Open
                </button>
              </div>
            </form>
            <p
              className="text-xs mt-3"
              style={{ color: 'var(--text-secondary)' }}
            >
              Enter the full path to a file in WSL.
              <br />
              Example: /home/user/projects/docs/README.md
            </p>
          </div>
        </div>
      )}
    </>
  );
}
