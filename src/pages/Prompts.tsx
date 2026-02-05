import { useState, useCallback, useMemo } from 'react';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useAppStore } from '../hooks/useAppStore';
import { useWorkspaceContext } from '../context/WorkspaceContext';
import { usePageState } from '../context/PageStateContext';
import { PromptLibrary } from '../components/PromptLibrary';
import { PromptNotebook } from '../components/PromptNotebook';
import { FilePickerModal } from '../components/FilePickerModal';
import { isPromptyFile } from '../utils/promptyUtils';
import { FolderOpen, FileText, X, Clock, ChevronLeft } from 'lucide-react';

/**
 * Derive home path from workspace path.
 * e.g., /home/matt/projects/something -> /home/matt
 */
function getHomePath(workspacePath: string | null): string {
  if (!workspacePath) return '/home';
  const match = workspacePath.match(/^(\/home\/[^/]+)/);
  return match ? match[1] : '/home';
}

export function Prompts() {
  // Get page state from context for persistence across navigation
  const { promptsState, setPromptsState } = usePageState();

  const currentFile = promptsState.currentFile;
  const setCurrentFile = useCallback(
    (path: string | null) => setPromptsState({ currentFile: path }),
    [setPromptsState]
  );

  const showLibrary = promptsState.showLibrary;
  const setShowLibrary = useCallback(
    (show: boolean) => setPromptsState({ showLibrary: show }),
    [setPromptsState]
  );

  const [showFilePicker, setShowFilePicker] = useState(false);

  const {
    state: appState,
    addRecentFile,
    saveFontSize,
    saveSidebarWidth,
  } = useAppStore();

  // Local state for sidebar width during drag (for smooth updates)
  const [sidebarWidth, setSidebarWidth] = useState(appState.sidebarWidth);

  // Get workspace from global context
  const { workspacePath } = useWorkspaceContext();

  // Use file watcher to get content and streaming state
  const { content, error, loading, isStreaming, connected } = useFileWatcher({
    path: currentFile,
  });

  // Filter recent files to only .prompty files
  const recentPromptyFiles = useMemo(() => {
    return appState.recentFiles
      .filter(isPromptyFile)
      .slice(0, 5);
  }, [appState.recentFiles]);

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

  const handleOpenFilePicker = useCallback(() => {
    setShowFilePicker(true);
  }, []);

  const handleFilePickerSelect = useCallback((path: string) => {
    setShowFilePicker(false);
    handleFileSelect(path);
  }, [handleFileSelect]);

  const handleFilePickerCancel = useCallback(() => {
    setShowFilePicker(false);
  }, []);

  // Handle sidebar width change during drag (real-time updates)
  const handleSidebarWidthChange = useCallback((width: number) => {
    setSidebarWidth(width);
  }, []);

  // Handle sidebar width change end (persist to localStorage)
  const handleSidebarWidthChangeEnd = useCallback((width: number) => {
    saveSidebarWidth(width);
  }, [saveSidebarWidth]);

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
          {/* Open button */}
          <button
            type="button"
            onClick={handleOpenFilePicker}
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
            homePath={getHomePath(workspacePath)}
            projectPath={workspacePath ?? undefined}
            selectedPath={currentFile ?? undefined}
            onSelectPrompt={handleFileSelect}
            width={sidebarWidth}
            onWidthChange={handleSidebarWidthChange}
            onWidthChangeEnd={handleSidebarWidthChangeEnd}
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
                  Make sure the backend is running on port 8130
                </p>
              </div>
            </div>
          )}

          {!loading && !error && !currentFile && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                {recentPromptyFiles.length > 0 ? (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <Clock size={18} style={{ color: 'var(--text-secondary)' }} />
                      <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                        Recent Prompts
                      </h2>
                    </div>
                    <div className="space-y-1">
                      {recentPromptyFiles.map((path) => (
                        <button
                          key={path}
                          type="button"
                          onClick={() => handleFileSelect(path)}
                          className="w-full text-left px-3 py-2 text-sm transition-colors hover:opacity-80"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <span style={{ color: 'var(--accent)' }}>
                            {path.split('/').pop()}
                          </span>
                          <span
                            className="block text-xs truncate mt-0.5"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {path}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs mt-4" style={{ color: 'var(--text-secondary)' }}>
                      Or select a file from the library
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <ChevronLeft size={20} style={{ color: 'var(--text-secondary)' }} />
                      <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                        Select a prompt from the library
                      </h2>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Prompty files support {'{{variable}}'} placeholders
                    </p>
                  </>
                )}
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

      {/* File Picker Modal */}
      {showFilePicker && (
        <FilePickerModal
          mode="file"
          onSelect={handleFilePickerSelect}
          onCancel={handleFilePickerCancel}
          initialPath={workspacePath ?? getHomePath(workspacePath)}
          filter={['.prompty']}
          title="Open Prompty File"
        />
      )}
    </>
  );
}
