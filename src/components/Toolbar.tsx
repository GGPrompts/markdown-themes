import { useState, useRef, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ThemeSelector } from './ThemeSelector';
import type { ThemeId } from '../themes';

interface ToolbarProps {
  currentFile: string | null;
  currentTheme: ThemeId;
  isStreaming?: boolean;
  hasWorkspace?: boolean;
  recentFiles?: string[];
  canExport?: boolean;
  onThemeChange: (theme: ThemeId) => void;
  onFileSelect: (path: string) => void;
  onFolderSelect?: (path: string) => void;
  onExport?: () => void;
}

export function Toolbar({ currentFile, currentTheme, isStreaming, hasWorkspace, recentFiles = [], canExport = false, onThemeChange, onFileSelect, onFolderSelect, onExport }: ToolbarProps) {
  const [showRecentFiles, setShowRecentFiles] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleOpenFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    });

    if (selected && typeof selected === 'string') {
      onFileSelect(selected);
    }
  };

  const handleOpenFolder = async () => {
    const selected = await open({
      directory: true,
      recursive: true,
      title: 'Select Workspace Folder',
    });

    if (selected && typeof selected === 'string') {
      onFolderSelect?.(selected);
    }
  };

  const handleRecentFileClick = (path: string) => {
    onFileSelect(path);
    setShowRecentFiles(false);
  };

  const getFileName = (path: string) => path.split('/').pop() ?? path.split('\\').pop() ?? path;
  const fileName = currentFile ? getFileName(currentFile) : null;

  return (
    <header
      className="flex items-center justify-between px-4 py-3 select-none"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-4">
        <div className="relative" ref={dropdownRef}>
          <div className="flex">
            <button
              onClick={handleOpenFile}
              className="px-4 py-1.5 text-white font-medium text-sm transition-colors"
              style={{
                backgroundColor: 'var(--accent)',
                borderRadius: 'var(--radius) 0 0 var(--radius)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
            >
              Open File
            </button>
            {recentFiles.length > 0 && (
              <button
                onClick={() => setShowRecentFiles(!showRecentFiles)}
                className="px-2 py-1.5 text-white transition-colors"
                style={{
                  backgroundColor: 'var(--accent)',
                  borderRadius: '0 var(--radius) var(--radius) 0',
                  borderLeft: '1px solid rgba(255,255,255,0.2)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
                title="Recent files"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
                    key={path}
                    onClick={() => handleRecentFileClick(path)}
                    className="w-full px-3 py-2 text-left text-sm transition-colors flex flex-col gap-0.5"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span className="font-medium truncate">{getFileName(path)}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{path}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!hasWorkspace && (
          <button
            onClick={handleOpenFolder}
            className="px-4 py-1.5 font-medium text-sm transition-colors"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
          >
            Open Folder
          </button>
        )}
        {fileName && (
          <span className="text-sm truncate max-w-[300px]" style={{ color: 'var(--text-secondary)' }} title={currentFile ?? ''}>
            {fileName}
          </span>
        )}
        {canExport && (
          <button
            onClick={onExport}
            className="px-3 py-1.5 font-medium text-sm transition-colors flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            title="Export to HTML"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        )}
        {isStreaming && (
          <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent)' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--accent)' }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'var(--accent)' }}></span>
            </span>
            AI writing...
          </span>
        )}
      </div>

      <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
    </header>
  );
}
