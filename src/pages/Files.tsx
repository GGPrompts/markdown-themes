import { useEffect, useCallback, useMemo } from 'react';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useWorkspace } from '../hooks/useWorkspace';
import { useAppStore } from '../hooks/useAppStore';
import { useTabManager } from '../hooks/useTabManager';
import { useSplitView } from '../hooks/useSplitView';
import { Toolbar } from '../components/Toolbar';
import { ViewerContainer } from '../components/ViewerContainer';
import { MetadataBar } from '../components/MetadataBar';
import { Sidebar } from '../components/Sidebar';
import { TabBar } from '../components/TabBar';
import { SplitView } from '../components/SplitView';
import { parseFrontmatter } from '../utils/frontmatter';
import { themes, type ThemeId } from '../themes';

export function Files() {
  const {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    pinTab,
    closeTab,
    setActiveTab,
  } = useTabManager();

  // Current file is derived from the active tab
  const currentFile = activeTab?.path ?? null;

  const {
    state: appState,
    isLoading: storeLoading,
    saveTheme,
    addRecentFile,
    addRecentFolder,
    saveLastWorkspace,
    saveFontSize,
  } = useAppStore();

  // Split view state
  const {
    isSplit,
    splitRatio,
    rightFile,
    toggleSplit,
    setSplitRatio,
    setRightFile,
  } = useSplitView();

  // Use file watcher to get content and streaming state (left/main pane)
  const {
    content,
    error,
    loading,
    isStreaming,
    connected,
  } = useFileWatcher({
    path: currentFile,
  });

  // File watcher for right pane (only active when split view is enabled)
  const {
    content: rightContent,
    error: rightError,
    loading: rightLoading,
    isStreaming: rightIsStreaming,
  } = useFileWatcher({
    path: isSplit ? rightFile : null,
  });

  const { workspacePath, fileTree, openWorkspace, closeWorkspace } = useWorkspace();

  const themeClass = themes.find((t) => t.id === appState.theme)?.className ?? '';

  // Check if current file is markdown
  const isMarkdownFile = useMemo(() => {
    if (!currentFile) return false;
    const ext = currentFile.split('.').pop()?.toLowerCase();
    return ext === 'md' || ext === 'markdown' || ext === 'mdx';
  }, [currentFile]);

  // Parse frontmatter from content (only for markdown files)
  const { frontmatter, content: markdownContent } = useMemo(
    () => (isMarkdownFile ? parseFrontmatter(content) : { frontmatter: null, content }),
    [content, isMarkdownFile]
  );

  // Check if right file is markdown
  const isRightMarkdownFile = useMemo(() => {
    if (!rightFile) return false;
    const ext = rightFile.split('.').pop()?.toLowerCase();
    return ext === 'md' || ext === 'markdown' || ext === 'mdx';
  }, [rightFile]);

  // Parse frontmatter from right content (only for markdown files)
  const { frontmatter: rightFrontmatter, content: rightMarkdownContent } = useMemo(
    () => (isRightMarkdownFile ? parseFrontmatter(rightContent) : { frontmatter: null, content: rightContent }),
    [rightContent, isRightMarkdownFile]
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

  // Handle file selection (single-click = preview)
  const handleFileSelect = useCallback(
    (path: string) => {
      openTab(path, true); // preview mode
      addRecentFile(path);
    },
    [openTab, addRecentFile]
  );

  // Handle file double-click (pin the tab)
  const handleFileDoubleClick = useCallback(
    (path: string) => {
      openTab(path, false); // pinned mode
      addRecentFile(path);
    },
    [openTab, addRecentFile]
  );

  // Handle file selection for right pane (in split view mode)
  const handleRightFileSelect = useCallback(
    (path: string) => {
      setRightFile(path);
      addRecentFile(path);
    },
    [setRightFile, addRecentFile]
  );

  // Handle folder selection with workspace persistence
  const handleFolderSelect = useCallback(
    (path: string) => {
      openWorkspace(path);
      saveLastWorkspace(path);
      addRecentFolder(path);
    },
    [openWorkspace, saveLastWorkspace, addRecentFolder]
  );

  const handleCloseWorkspace = useCallback(() => {
    closeWorkspace();
    // Close all tabs when closing workspace
    tabs.forEach((tab) => closeTab(tab.id));
    saveLastWorkspace(null);
  }, [closeWorkspace, saveLastWorkspace, tabs, closeTab]);

  return (
    <>
      <Toolbar
        currentFile={currentFile}
        currentTheme={appState.theme}
        isStreaming={isStreaming}
        connected={connected}
        hasWorkspace={!!workspacePath}
        recentFiles={appState.recentFiles}
        recentFolders={appState.recentFolders}
        fontSize={appState.fontSize}
        isSplit={isSplit}
        onThemeChange={handleThemeChange}
        onFileSelect={handleFileSelect}
        onFolderSelect={handleFolderSelect}
        onFontSizeChange={handleFontSizeChange}
        onSplitToggle={toggleSplit}
      />

      <div className="flex-1 flex overflow-hidden">
        {workspacePath && (
          <Sidebar
            fileTree={fileTree}
            currentFile={currentFile}
            workspacePath={workspacePath}
            isSplit={isSplit}
            onFileSelect={handleFileSelect}
            onFileDoubleClick={handleFileDoubleClick}
            onRightFileSelect={handleRightFileSelect}
            onClose={handleCloseWorkspace}
          />
        )}

        <SplitView
          isSplit={isSplit}
          splitRatio={splitRatio}
          onSplitRatioChange={setSplitRatio}
          leftPane={
            <div className="flex-1 flex flex-col overflow-hidden">
              <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onTabSelect={setActiveTab}
                onTabClose={closeTab}
                onTabPin={pinTab}
              />

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
                  {isMarkdownFile && frontmatter && <MetadataBar frontmatter={frontmatter} />}
                  <div className="flex-1 overflow-auto">
                    <ViewerContainer
                      filePath={currentFile}
                      content={markdownContent}
                      isStreaming={isStreaming}
                      themeClassName={themeClass}
                      fontSize={appState.fontSize}
                    />
                  </div>
                </>
              )}
            </div>
          }
          rightPane={
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Right pane header with file selector */}
              <div
                className="flex items-center gap-2 px-3 py-2 border-b"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                }}
              >
                <select
                  value={rightFile ?? ''}
                  onChange={(e) => handleRightFileSelect(e.target.value)}
                  className="flex-1 text-sm px-2 py-1 outline-none"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <option value="">Select a file...</option>
                  {appState.recentFiles.map((path) => (
                    <option key={path} value={path}>
                      {path.split('/').pop()}
                    </option>
                  ))}
                </select>
                {rightIsStreaming && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                    <span className="relative flex h-2 w-2">
                      <span
                        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                      <span
                        className="relative inline-flex rounded-full h-2 w-2"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    </span>
                    AI writing...
                  </span>
                )}
              </div>

              {rightLoading && (
                <div className="flex items-center justify-center h-full">
                  <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                </div>
              )}

              {rightError && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-red-500 mb-2">{rightError}</p>
                  </div>
                </div>
              )}

              {!rightLoading && !rightError && !rightFile && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Select a file to view in split pane
                    </p>
                  </div>
                </div>
              )}

              {!rightLoading && !rightError && rightFile && (
                <>
                  {isRightMarkdownFile && rightFrontmatter && <MetadataBar frontmatter={rightFrontmatter} />}
                  <div className="flex-1 overflow-auto">
                    <ViewerContainer
                      filePath={rightFile}
                      content={rightMarkdownContent}
                      isStreaming={rightIsStreaming}
                      themeClassName={themeClass}
                      fontSize={appState.fontSize}
                    />
                  </div>
                </>
              )}
            </div>
          }
        />
      </div>
    </>
  );
}
