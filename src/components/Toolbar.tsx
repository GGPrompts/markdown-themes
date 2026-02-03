import { useState, useRef, useEffect } from 'react';
import { ThemeSelector } from './ThemeSelector';
import type { ThemeId } from '../themes';

interface ToolbarProps {
  currentFile: string | null;
  currentTheme: ThemeId;
  isStreaming?: boolean;
  connected?: boolean;
  hasWorkspace?: boolean;
  recentFiles?: string[];
  onThemeChange: (theme: ThemeId) => void;
  onFileSelect: (path: string) => void;
  onFolderSelect?: (path: string) => void;
}

export function Toolbar({
  currentFile,
  currentTheme,
  isStreaming,
  connected = false,
  hasWorkspace,
  recentFiles = [],
  onThemeChange,
  onFileSelect,
  onFolderSelect,
}: ToolbarProps) {
  const [showRecentFiles, setShowRecentFiles] = useState(false);
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const [pathInputMode, setPathInputMode] = useState<'file' | 'folder'>('file');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
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
    setPathInputMode('file');
    setPathInputValue('');
    setShowPathInput(true);
  };

  const handleOpenFolder = () => {
    setPathInputMode('folder');
    setPathInputValue('');
    setShowPathInput(true);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathInputValue.trim()) return;

    if (pathInputMode === 'file') {
      onFileSelect(pathInputValue.trim());
    } else {
      onFolderSelect?.(pathInputValue.trim());
    }
    setShowPathInput(false);
    setPathInputValue('');
  };

  const handleRecentFileClick = (path: string) => {
    onFileSelect(path);
    setShowRecentFiles(false);
  };

  const getFileName = (path: string) => path.split('/').pop() ?? path.split('\\').pop() ?? path;
  const fileName = currentFile ? getFileName(currentFile) : null;

  return (
    <>
      <header
        className="flex items-center justify-between px-4 py-3 select-none"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-4">
          {/* Connection indicator */}
          <div
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: connected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: connected ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: connected ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)' }}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </div>

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
                className="absolute top-full left-0 mt-1 z-50 min-w-[280px] max-w-[400px] py-1 overflow-hidden shadow-lg"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
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

          {!hasWorkspace && (
            <button
              type="button"
              onClick={handleOpenFolder}
              className="btn-secondary px-4 py-1.5 font-medium text-sm transition-colors"
              style={{ borderRadius: 'var(--radius)' }}
            >
              Open Folder
            </button>
          )}

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
        </div>

        <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
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
              {pathInputMode === 'file' ? 'Open File' : 'Open Folder'}
            </h2>
            <form onSubmit={handlePathSubmit}>
              <input
                ref={pathInputRef}
                type="text"
                value={pathInputValue}
                onChange={(e) => setPathInputValue(e.target.value)}
                placeholder={
                  pathInputMode === 'file'
                    ? '/path/to/file.md'
                    : '/path/to/folder'
                }
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
              Enter the full path to a {pathInputMode === 'file' ? 'markdown file' : 'folder'} in WSL.
              <br />
              Example: /home/user/projects/docs{pathInputMode === 'file' ? '/README.md' : ''}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
