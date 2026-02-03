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
import { generateHtml } from './utils/exportHtml';
import { isTauri } from './utils/platform';
import './index.css';

function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [browserContent, setBrowserContent] = useState<string | null>(null); // For browser mode
  const markdownViewerRef = useRef<MarkdownViewerHandle>(null);
  const isTauriEnv = isTauri();

  const {
    state: appState,
    isLoading: storeLoading,
    saveTheme,
    addRecentFile,
    saveLastWorkspace,
  } = useAppStore();

  // Only use file watcher in Tauri mode
  const { content: watchedContent, error, loading, isStreaming } = useFileWatcher({
    path: isTauriEnv ? currentFile : null
  });

  // Use browser content or watched content
  const content = isTauriEnv ? watchedContent : (browserContent ?? '');

  const { workspacePath, fileTree, openWorkspace, closeWorkspace } = useWorkspace();

  const themeClass = themes.find(t => t.id === appState.theme)?.className ?? '';

  // Parse frontmatter from content
  const { frontmatter, content: markdownContent } = useMemo(
    () => parseFrontmatter(content),
    [content]
  );

  // Restore last workspace on mount (Tauri only)
  useEffect(() => {
    if (isTauriEnv && !storeLoading && appState.lastWorkspace && !workspacePath) {
      openWorkspace(appState.lastWorkspace);
    }
  }, [isTauriEnv, storeLoading, appState.lastWorkspace, workspacePath, openWorkspace]);

  // Handle theme change with persistence
  const handleThemeChange = useCallback((theme: ThemeId) => {
    saveTheme(theme);
  }, [saveTheme]);

  // Handle file selection with recent files tracking
  const handleFileSelect = useCallback((path: string) => {
    setCurrentFile(path);
    addRecentFile(path);
  }, [addRecentFile]);

  // Handle browser file content (when using File System Access API)
  const handleFileContent = useCallback((content: string) => {
    setBrowserContent(content);
  }, []);

  // Handle folder selection with workspace persistence
  const handleFolderSelect = useCallback((path: string) => {
    openWorkspace(path);
    saveLastWorkspace(path);
  }, [openWorkspace, saveLastWorkspace]);

  const handleCloseWorkspace = useCallback(() => {
    closeWorkspace();
    setCurrentFile(null);
    saveLastWorkspace(null);
  }, [closeWorkspace, saveLastWorkspace]);

  // Handle export to HTML (Tauri only)
  const handleExport = useCallback(async () => {
    if (!isTauriEnv || !markdownViewerRef.current || !currentFile) return;

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const renderedHtml = markdownViewerRef.current.getHtml();
      if (!renderedHtml) return;

      const fileName = currentFile.split('/').pop() ?? currentFile.split('\\').pop() ?? 'document';
      const baseName = fileName.replace(/\.(md|markdown|txt)$/i, '');

      const savePath = await save({
        defaultPath: `${baseName}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
        title: 'Export as HTML',
      });

      if (!savePath) return;

      const html = generateHtml({
        renderedHtml,
        themeId: appState.theme,
        title: baseName,
      });

      await writeTextFile(savePath, html);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [isTauriEnv, currentFile, appState.theme]);

  // Check if we can export (have content and not loading)
  const canExport = !loading && !error && !!markdownContent;

  // Determine loading state
  const isLoading = isTauriEnv ? loading : false;
  const hasError = isTauriEnv ? error : null;

  return (
    <div className={`min-h-screen flex flex-col ${themeClass}`} style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Toolbar
        currentFile={currentFile}
        currentTheme={appState.theme}
        isStreaming={isStreaming}
        hasWorkspace={!!workspacePath}
        recentFiles={appState.recentFiles}
        canExport={canExport}
        onThemeChange={handleThemeChange}
        onFileSelect={handleFileSelect}
        onFileContent={handleFileContent}
        onFolderSelect={handleFolderSelect}
        onExport={handleExport}
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
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
            </div>
          )}

          {hasError && (
            <div className="flex items-center justify-center h-full">
              <p className="text-red-500">{hasError}</p>
            </div>
          )}

          {!isLoading && !hasError && (
            <>
              {frontmatter && <MetadataBar frontmatter={frontmatter} />}
              <div className="flex-1 overflow-auto">
                <MarkdownViewer ref={markdownViewerRef} content={markdownContent} isStreaming={isStreaming} themeClassName={themeClass} />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
