import { useCallback, useMemo, useState } from 'react';
import { Clock, ChevronLeft } from 'lucide-react';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useWorkspaceContext } from '../context/WorkspaceContext';
import { usePageState } from '../context/PageStateContext';
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
import { themes } from '../themes';

/**
 * Derive home path from workspace path.
 * e.g., /home/matt/projects/something -> /home/matt
 */
function getHomePath(workspacePath: string | null): string {
  if (!workspacePath) return '/home';
  const match = workspacePath.match(/^(\/home\/[^/]+)/);
  return match ? match[1] : '/home';
}

export function Files() {
  // Get page state from context for persistence across navigation
  const { filesState, setFilesState } = usePageState();

  // Tab manager with initial state from context
  const handleTabStateChange = useCallback(
    (tabs: Parameters<typeof setFilesState>[0]['tabs'], activeTabId: string | null) => {
      setFilesState({ tabs, activeTabId });
    },
    [setFilesState]
  );

  const {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    pinTab,
    closeTab,
    setActiveTab,
  } = useTabManager({
    initialTabs: filesState.tabs,
    initialActiveTabId: filesState.activeTabId,
    onStateChange: handleTabStateChange,
  });

  // Current file is derived from the active tab
  const currentFile = activeTab?.path ?? null;

  const {
    state: appState,
    addRecentFile,
    saveFontSize,
    saveSidebarWidth,
    toggleFavorite,
    isFavorite,
  } = useAppStore();

  // Local state for sidebar width during drag (for smooth updates)
  const [sidebarWidth, setSidebarWidth] = useState(appState.sidebarWidth);

  // Get workspace from global context
  const { workspacePath, fileTree } = useWorkspaceContext();

  // Split view state with initial state from context
  const handleSplitStateChange = useCallback(
    (state: { isSplit: boolean; splitRatio: number; rightFile: string | null }) => {
      setFilesState(state);
    },
    [setFilesState]
  );

  const {
    isSplit,
    splitRatio,
    rightFile,
    toggleSplit,
    setSplitRatio,
    setRightFile,
  } = useSplitView({
    initialState: {
      isSplit: filesState.isSplit,
      splitRatio: filesState.splitRatio,
      rightFile: filesState.rightFile,
    },
    onStateChange: handleSplitStateChange,
  });

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

  // Get recent files for empty state (limit to 6)
  const recentFilesForEmptyState = useMemo(() => {
    return appState.recentFiles.slice(0, 6);
  }, [appState.recentFiles]);

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

  // Handle drop to right pane (drag-and-drop from tabs)
  const handleDropToRight = useCallback(
    (path: string) => {
      // Don't do anything if dropping the same file
      if (path === rightFile) return;
      setRightFile(path);
      addRecentFile(path);
    },
    [rightFile, setRightFile, addRecentFile]
  );

  // Handle closing the right pane file
  const handleCloseRight = useCallback(() => {
    setRightFile(null);
  }, [setRightFile]);

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
      <Toolbar
        currentFile={currentFile}
        isStreaming={isStreaming}
        connected={connected}
        recentFiles={appState.recentFiles}
        fontSize={appState.fontSize}
        isSplit={isSplit}
        content={content}
        workspacePath={workspacePath}
        onFileSelect={handleFileSelect}
        onFontSizeChange={handleFontSizeChange}
        onSplitToggle={toggleSplit}
      />

      <div className="flex-1 flex overflow-hidden">
        {workspacePath && (
          <Sidebar
            fileTree={fileTree}
            currentFile={currentFile}
            workspacePath={workspacePath}
            homePath={getHomePath(workspacePath)}
            isSplit={isSplit}
            width={sidebarWidth}
            onWidthChange={handleSidebarWidthChange}
            onWidthChangeEnd={handleSidebarWidthChangeEnd}
            onFileSelect={handleFileSelect}
            onFileDoubleClick={handleFileDoubleClick}
            onRightFileSelect={handleRightFileSelect}
            favorites={appState.favorites}
            toggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />
        )}

        <SplitView
          isSplit={isSplit}
          splitRatio={splitRatio}
          onSplitRatioChange={setSplitRatio}
          onDropToRight={handleDropToRight}
          rightFile={rightFile}
          onCloseRight={handleCloseRight}
          rightIsStreaming={rightIsStreaming}
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
                  <div className="text-center max-w-md">
                    {recentFilesForEmptyState.length > 0 ? (
                      <>
                        <div className="flex items-center justify-center gap-2 mb-4">
                          <Clock size={18} style={{ color: 'var(--text-secondary)' }} />
                          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                            Recent Files
                          </h2>
                        </div>
                        <div className="space-y-1">
                          {recentFilesForEmptyState.map((path) => (
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
                          Or select a file from the sidebar
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <ChevronLeft size={20} style={{ color: 'var(--text-secondary)' }} />
                          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                            Select a file from the sidebar
                          </h2>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Browse and open markdown files to view them with beautiful themes
                        </p>
                      </>
                    )}
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
                      Drag a tab here to view in split pane
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
