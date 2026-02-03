import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
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
  } = useAppStore();

  const { content, error, loading, isStreaming } = useFileWatcher({ path: currentFile });
  const { workspacePath, fileTree, openWorkspace, closeWorkspace } = useWorkspace();

  const themeClass = themes.find(t => t.id === appState.theme)?.className ?? '';

  // Parse frontmatter from content
  const { frontmatter, content: markdownContent } = useMemo(
    () => parseFrontmatter(content),
    [content]
  );

  // Restore last workspace on mount
  useEffect(() => {
    if (!storeLoading && appState.lastWorkspace && !workspacePath) {
      openWorkspace(appState.lastWorkspace);
    }
  }, [storeLoading, appState.lastWorkspace, workspacePath, openWorkspace]);

  // Handle theme change with persistence
  const handleThemeChange = useCallback((theme: ThemeId) => {
    saveTheme(theme);
  }, [saveTheme]);

  // Handle file selection with recent files tracking
  const handleFileSelect = useCallback((path: string) => {
    setCurrentFile(path);
    addRecentFile(path);
  }, [addRecentFile]);

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

  // Handle export to HTML
  const handleExport = useCallback(async () => {
    if (!markdownViewerRef.current || !currentFile) return;

    const renderedHtml = markdownViewerRef.current.getHtml();
    if (!renderedHtml) return;

    // Get filename without extension for default save name
    const fileName = currentFile.split('/').pop() ?? currentFile.split('\\').pop() ?? 'document';
    const baseName = fileName.replace(/\.(md|markdown|txt)$/i, '');

    // Show save dialog
    const savePath = await save({
      defaultPath: `${baseName}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }],
      title: 'Export as HTML',
    });

    if (!savePath) return;

    // Generate HTML with embedded styles
    const html = generateHtml({
      renderedHtml,
      themeId: appState.theme,
      title: baseName,
    });

    // Write file
    await writeTextFile(savePath, html);
  }, [currentFile, appState.theme]);

  // Check if we can export (have content and not loading)
  const canExport = !loading && !error && !!markdownContent;

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
          {loading && (
            <div className="flex items-center justify-center h-full">
              <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <p className="text-red-500">{error}</p>
            </div>
          )}

          {!loading && !error && (
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
