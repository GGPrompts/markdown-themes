import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, ChevronDown, X } from 'lucide-react';
import { FilePickerModal } from './FilePickerModal';

interface ProjectSelectorProps {
  currentPath: string | null;
  recentFolders: string[];
  onFolderSelect: (path: string) => void;
  onClose: () => void;
}

interface DropdownPosition {
  top: number;
  right: number;
}

// Read CSS variable values from the themed container
function getThemeColors() {
  const root = document.querySelector('[class*="theme-"]') || document.documentElement;
  const style = getComputedStyle(root);
  return {
    bgPrimary: style.getPropertyValue('--bg-primary').trim() || '#1a1a1a',
    bgSecondary: style.getPropertyValue('--bg-secondary').trim() || '#2a2a2a',
    textPrimary: style.getPropertyValue('--text-primary').trim() || '#e0e0e0',
    textSecondary: style.getPropertyValue('--text-secondary').trim() || '#a0a0a0',
    accent: style.getPropertyValue('--accent').trim() || '#3b82f6',
    border: style.getPropertyValue('--border').trim() || '#404040',
    radius: style.getPropertyValue('--radius').trim() || '8px',
  };
}

export function ProjectSelector({
  currentPath,
  recentFolders,
  onFolderSelect,
  onClose,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideContainer = containerRef.current?.contains(target);
      const isInsideDropdown = dropdownRef.current?.contains(target);
      if (!isInsideContainer && !isInsideDropdown) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get theme colors for portal (which is outside theme container)
  const colors = getThemeColors();

  // Calculate dropdown position when opening
  const toggleDropdown = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen(!isOpen);
  };

  const handleRecentFolderClick = (path: string) => {
    onFolderSelect(path);
    setIsOpen(false);
  };

  const handleOpenFolderClick = () => {
    setIsOpen(false);
    setShowFilePicker(true);
  };

  const handleFilePickerSelect = (path: string) => {
    onFolderSelect(path);
    setShowFilePicker(false);
  };

  const handleCloseWorkspace = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
    setIsOpen(false);
  };

  // Get display name: last path segment only
  const getDisplayName = (path: string) => {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] || path;
  };

  const getFolderName = (path: string) => path.split('/').pop() ?? path.split('\\').pop() ?? path;

  return (
    <>
      <div className="relative flex items-center gap-1" ref={containerRef}>
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleDropdown}
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
            className="truncate"
            title={currentPath ?? 'No project open'}
          >
            {currentPath ? getDisplayName(currentPath) : 'Open Project'}
          </span>
          <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </button>
        {/* Close button - separate to avoid nested button issue */}
        {currentPath && (
          <button
            type="button"
            onClick={handleCloseWorkspace}
            className="p-1 rounded transition-colors hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Close project"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

      </div>

      {/* Dropdown - rendered via portal to escape all stacking contexts */}
      {isOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] min-w-[280px] max-w-[400px] py-1 overflow-hidden"
          style={{
            top: dropdownPos.top,
            right: dropdownPos.right,
            backgroundColor: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: colors.radius,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -4px rgba(0, 0, 0, 0.15)',
          }}
        >
          {/* Current project indicator */}
          {currentPath && (
            <>
              <div
                className="px-3 py-1.5 text-xs uppercase tracking-wide"
                style={{ color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}
              >
                Current Project
              </div>
              <div
                className="px-3 py-2 text-sm flex items-center gap-2"
                style={{ color: colors.accent, backgroundColor: `${colors.accent}1a` }}
              >
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="truncate" title={currentPath}>
                  {currentPath}
                </span>
              </div>
              <div style={{ borderBottom: `1px solid ${colors.border}` }} className="my-1" />
            </>
          )}

          {/* Recent folders */}
          {recentFolders.length > 0 && (
            <>
              <div
                className="px-3 py-1.5 text-xs uppercase tracking-wide"
                style={{ color: colors.textSecondary }}
              >
                Recent Projects
              </div>
              <div
                className="max-h-[200px] overflow-y-auto"
                style={{ scrollbarColor: `${colors.border} ${colors.bgSecondary}` }}
              >
                {recentFolders
                  .filter((path) => path !== currentPath)
                  .map((path) => (
                    <button
                      type="button"
                      key={path}
                      onClick={() => handleRecentFolderClick(path)}
                      className="w-full px-3 py-2 text-left text-sm transition-colors flex flex-col gap-0.5"
                      style={{ color: colors.textPrimary }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgPrimary}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <span className="font-medium truncate flex items-center gap-2">
                        <Folder className="w-4 h-4 shrink-0" style={{ color: colors.textSecondary }} />
                        {getFolderName(path)}
                      </span>
                      <span className="text-xs truncate pl-6" style={{ color: colors.textSecondary }}>
                        {path}
                      </span>
                    </button>
                  ))}
              </div>
              <div style={{ borderBottom: `1px solid ${colors.border}` }} className="my-1" />
            </>
          )}

          {/* Open folder button */}
          <button
            type="button"
            onClick={handleOpenFolderClick}
            className="w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2"
            style={{ color: colors.textPrimary }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgPrimary}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FolderOpen className="w-4 h-4" style={{ color: colors.accent }} />
            Open Folder...
          </button>
        </div>,
        document.body
      )}

      {/* File Picker Modal */}
      {showFilePicker && (
        <FilePickerModal
          mode="folder"
          onSelect={handleFilePickerSelect}
          onCancel={() => setShowFilePicker(false)}
          initialPath={currentPath ?? '/home'}
          title="Open Project Folder"
        />
      )}
    </>
  );
}
