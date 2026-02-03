import { useState, useCallback, useRef, useEffect } from 'react';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useAppStore } from '../hooks/useAppStore';
import { useWorkspaceContext } from '../context/WorkspaceContext';
import { PromptLibrary } from '../components/PromptLibrary';
import { PromptNotebook } from '../components/PromptNotebook';
import { isPromptyFile } from '../utils/promptyUtils';
import { FolderOpen, FileText, X } from 'lucide-react';

// Default home path for WSL - can be customized
const DEFAULT_HOME_PATH = '/home/marci';

export function Prompts() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathInputValue, setPathInputValue] = useState('');
  const [showLibrary, setShowLibrary] = useState(true);
  const pathInputRef = useRef<HTMLInputElement>(null);

  const {
    state: appState,
    addRecentFile,
    saveFontSize,
  } = useAppStore();

  // Get workspace from global context
  const { workspacePath } = useWorkspaceContext();

  // Use file watcher to get content and streaming state
  const { content, error, loading, isStreaming, connected } = useFileWatcher({
    path: currentFile,
  });

  // Focus input when modal opens
  useEffect(() => {
    if (showPathInput && pathInputRef.current) {
      pathInputRef.current.focus();
    }
  }, [showPathInput]);

  const handleFontSizeChange = useCallback(
    (size: number) => {
      saveFontSize(size);
    },
    [saveFontSize]
  );

  const handleFileSelect = useCallback(
    (path: string) => {
      // Only allow .prompty files
      if (!isPromptyFile(path)) {
        // Could show a toast/alert here
        console.warn('Only .prompty files are supported in Prompt Notebook');
        return;
      }
      setCurrentFile(path);
      addRecentFile(path);
    },
    [addRecentFile]
  );

  const handleCloseLibrary = useCallback(() => {
    setShowLibrary(false);
  }, []);

  const handleOpenLibrary = useCallback(() => {
    setShowLibrary(true);
  }, []);

  const handleOpenFile = () => {
    setPathInputValue('');
    setShowPathInput(true);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathInputValue.trim()) return;
    handleFileSelect(pathInputValue.trim());
    setShowPathInput(false);
    setPathInputValue('');
  };

  return (
    <>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-2 select-none relative z-20"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-4">
          {/* Connection indicator */}
          {!connected && currentFile && (
            <div
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: 'rgb(239, 68, 68)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: 'rgb(239, 68, 68)' }}
              />
              Disconnected
            </div>
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
              Updating...
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Open buttons */}
          <button
            type="button"
            onClick={handleOpenFile}
            className="btn-accent px-3 py-1.5 text-sm flex items-center gap-1.5"
            style={{ borderRadius: 'var(--radius)' }}
          >
            <FileText size={16} />
            Open .prompty
          </button>

          {showLibrary ? (
            <button
              type="button"
              onClick={handleCloseLibrary}
              className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5"
              style={{ borderRadius: 'var(--radius)' }}
              title="Hide prompt library sidebar"
            >
              <X size={16} />
              Hide Library
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenLibrary}
              className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5"
              style={{ borderRadius: 'var(--radius)' }}
              title="Show prompt library sidebar"
            >
              <FolderOpen size={16} />
              Show Library
            </button>
          )}

          {/* Font size controls */}
          <div className="flex items-center gap-1">
            <span className="text-sm mr-1" style={{ color: 'var(--text-secondary)' }}>
              Size:
            </span>
            <button
              type="button"
              onClick={() => handleFontSizeChange(Math.max(50, appState.fontSize - 10))}
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
              {appState.fontSize}%
            </span>
            <button
              type="button"
              onClick={() => handleFontSizeChange(Math.min(200, appState.fontSize + 10))}
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

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {showLibrary && (
          <PromptLibrary
            homePath={DEFAULT_HOME_PATH}
            projectPath={workspacePath ?? undefined}
            selectedPath={currentFile ?? undefined}
            onSelectPrompt={handleFileSelect}
          />
        )}

        <main className="flex-1 flex flex-col overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-500 mb-2">{error}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Make sure TabzChrome backend is running on port 8129
                </p>
              </div>
            </div>
          )}

          {!loading && !error && !currentFile && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <h2 className="text-xl font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Prompt Notebook
                </h2>
                <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                  Open a .prompty file to get started. Prompty files are markdown documents with
                  YAML frontmatter and fillable {'{{variable}}'} placeholders.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenFile}
                    className="btn-accent px-4 py-2 text-sm flex items-center gap-2"
                    style={{ borderRadius: 'var(--radius)' }}
                  >
                    <FileText size={18} />
                    Open .prompty File
                  </button>
                </div>
                <p className="text-xs mt-6" style={{ color: 'var(--text-secondary)' }}>
                  Supports: {'{{variable}}'}, {'{{variable:hint}}'}, and{' '}
                  {'{{variable:opt1|opt2|opt3}}'} for dropdowns
                </p>
              </div>
            </div>
          )}

          {!loading && !error && currentFile && content && (
            <PromptNotebook
              content={content}
              path={currentFile}
              fontSize={appState.fontSize}
              isStreaming={isStreaming}
            />
          )}
        </main>
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
            <h2 className="text-lg font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
              Open Prompty File
            </h2>
            <form onSubmit={handlePathSubmit}>
              <input
                ref={pathInputRef}
                type="text"
                value={pathInputValue}
                onChange={(e) => setPathInputValue(e.target.value)}
                placeholder="/path/to/prompt.prompty"
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
            <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
              Enter the full path to a .prompty file in WSL.
              <br />
              Example: /home/user/prompts/my-prompt.prompty
            </p>
          </div>
        </div>
      )}
    </>
  );
}
