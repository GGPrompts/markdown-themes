import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { themes, type ThemeId } from './themes';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useWorkspace } from './hooks/useWorkspace';
import { useAppStore } from './hooks/useAppStore';
import { Toolbar } from './components/Toolbar';
import { MarkdownViewer, type MarkdownViewerHandle } from './components/MarkdownViewer';
import { MetadataBar } from './components/MetadataBar';
import { Sidebar } from './components/Sidebar';
import { parseFrontmatter } from './utils/frontmatter';
import './index.css';

function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const markdownViewerRef = useRef<MarkdownViewerHandle>(null);

  const {
    state: appState,
    isLoading: storeLoading,
    saveTheme,
    addRecentFile,
    saveLastWorkspace,
    saveFontSize,
  } = useAppStore();

  // Use file watcher to get content and streaming state
  const {
    content,
    error,
    loading,
    isStreaming,
    connected,
  } = useFileWatcher({
    path: currentFile,
  });

  const { workspacePath, fileTree, openWorkspace, closeWorkspace } = useWorkspace();

  const themeClass = themes.find((t) => t.id === appState.theme)?.className ?? '';

  // Parse frontmatter from content
  const { frontmatter, content: markdownContent } = useMemo(
    () => parseFrontmatter(content),
    [content]
  );

  // Restore last workspace on mount
  useEffect(() => {
    if (!storeLoading && appState.lastWorkspace && !workspacePath) {
      openWorkspace(appState.lastWorkspace).then((success) => {
        if (!success) {
          // Path doesn't exist anymore, clear it from storage
          saveLastWorkspace(null);
        }
      });
    }
  }, [storeLoading, appState.lastWorkspace, workspacePath, openWorkspace, saveLastWorkspace]);

  // Handle theme change with persistence
  const handleThemeChange = useCallback(
    (theme: ThemeId) => {
      saveTheme(theme);
    },
    [saveTheme]
  );

  // Handle font size change with persistence
  const handleFontSizeChange = useCallback(
    (size: number) => {
      saveFontSize(size);
    },
    [saveFontSize]
  );

  // Handle file selection with recent files tracking
  const handleFileSelect = useCallback(
    (path: string) => {
      setCurrentFile(path);
      addRecentFile(path);
    },
    [addRecentFile]
  );

  // Handle folder selection with workspace persistence
  const handleFolderSelect = useCallback(
    (path: string) => {
      openWorkspace(path);
      saveLastWorkspace(path);
    },
    [openWorkspace, saveLastWorkspace]
  );

  const handleCloseWorkspace = useCallback(() => {
    closeWorkspace();
    setCurrentFile(null);
    saveLastWorkspace(null);
  }, [closeWorkspace, saveLastWorkspace]);

  return (
    <div
      className={`min-h-screen flex flex-col ${themeClass}`}
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <Toolbar
        currentFile={currentFile}
        currentTheme={appState.theme}
        isStreaming={isStreaming}
        connected={connected}
        hasWorkspace={!!workspacePath}
        recentFiles={appState.recentFiles}
        fontSize={appState.fontSize}
        onThemeChange={handleThemeChange}
        onFileSelect={handleFileSelect}
        onFolderSelect={handleFolderSelect}
        onFontSizeChange={handleFontSizeChange}
      />

      <div className="flex-1 flex overflow-hidden">
        {workspacePath && (
          <Sidebar
            fileTree={fileTree}
            currentFile={currentFile}
            workspacePath={workspacePath}
            onFileSelect={handleFileSelect}
            onClose={handleCloseWorkspace}
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
              <div className="text-center">
                <h2
                  className="text-xl font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Welcome to Markdown Themes
                </h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Open a file or folder to get started
                </p>
              </div>
            </div>
          )}

          {!loading && !error && currentFile && (
            <>
              {frontmatter && <MetadataBar frontmatter={frontmatter} />}
              <div className="flex-1 overflow-auto">
                <MarkdownViewer
                  ref={markdownViewerRef}
                  content={markdownContent}
                  isStreaming={isStreaming}
                  themeClassName={themeClass}
                  fontSize={appState.fontSize}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
