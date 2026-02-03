import { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, ChevronDown, X } from 'lucide-react';

interface ProjectSelectorProps {
  currentPath: string | null;
  recentFolders: string[];
  onFolderSelect: (path: string) => void;
  onClose: () => void;
}

export function ProjectSelector({
  currentPath,
  recentFolders,
  onFolderSelect,
  onClose,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
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

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathInputValue.trim()) return;
    onFolderSelect(pathInputValue.trim());
    setShowPathInput(false);
    setPathInputValue('');
    setIsOpen(false);
  };

  const handleRecentFolderClick = (path: string) => {
    onFolderSelect(path);
    setIsOpen(false);
  };

  const handleOpenFolderClick = () => {
    setIsOpen(false);
    setPathInputValue('');
    setShowPathInput(true);
  };

  const handleCloseWorkspace = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
    setIsOpen(false);
  };

  // Get display name: last 2 path segments
  const getDisplayName = (path: string) => {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 2) {
      return '/' + segments.join('/');
    }
    return '.../' + segments.slice(-2).join('/');
  };

  const getFolderName = (path: string) => path.split('/').pop() ?? path.split('\\').pop() ?? path;

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm transition-colors"
          style={{
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          {currentPath ? (
            <FolderOpen className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          ) : (
            <Folder className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <span
            className="max-w-[180px] truncate"
            title={currentPath ?? 'No project open'}
          >
            {currentPath ? getDisplayName(currentPath) : 'Open Project'}
          </span>
          <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          {currentPath && (
            <button
              type="button"
              onClick={handleCloseWorkspace}
              className="ml-1 p-0.5 rounded transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Close project"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </button>

        {isOpen && (
          <div
            className="absolute top-full right-0 mt-1 z-[100] min-w-[280px] max-w-[400px] py-1 overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -4px rgba(0, 0, 0, 0.15)',
            }}
          >
            {/* Current project indicator */}
            {currentPath && (
              <>
                <div
                  className="px-3 py-1.5 text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}
                >
                  Current Project
                </div>
                <div
                  className="px-3 py-2 text-sm flex items-center gap-2"
                  style={{ color: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span className="truncate" title={currentPath}>
                    {currentPath}
                  </span>
                </div>
                <div style={{ borderBottom: '1px solid var(--border)' }} className="my-1" />
              </>
            )}

            {/* Recent folders */}
            {recentFolders.length > 0 && (
              <>
                <div
                  className="px-3 py-1.5 text-xs uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Recent Projects
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {recentFolders
                    .filter((path) => path !== currentPath)
                    .map((path) => (
                      <button
                        type="button"
                        key={path}
                        onClick={() => handleRecentFolderClick(path)}
                        className="w-full px-3 py-2 text-left text-sm transition-colors flex flex-col gap-0.5 hover:bg-[var(--bg-primary)]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span className="font-medium truncate flex items-center gap-2">
                          <Folder className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                          {getFolderName(path)}
                        </span>
                        <span className="text-xs truncate pl-6" style={{ color: 'var(--text-secondary)' }}>
                          {path}
                        </span>
                      </button>
                    ))}
                </div>
                <div style={{ borderBottom: '1px solid var(--border)' }} className="my-1" />
              </>
            )}

            {/* Open folder button */}
            <button
              type="button"
              onClick={handleOpenFolderClick}
              className="w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 hover:bg-[var(--bg-primary)]"
              style={{ color: 'var(--text-primary)' }}
            >
              <FolderOpen className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              Open Folder...
            </button>
          </div>
        )}
      </div>

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
              Open Project Folder
            </h2>
            <form onSubmit={handlePathSubmit}>
              <input
                ref={pathInputRef}
                type="text"
                value={pathInputValue}
                onChange={(e) => setPathInputValue(e.target.value)}
                placeholder="/path/to/project"
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
              Enter the full path to a project folder in WSL.
              <br />
              Example: /home/user/projects/my-project
            </p>
          </div>
        </div>
      )}
    </>
  );
}
