import { Routes, Route } from 'react-router-dom';
import { themes } from './themes';
import { useAppStore } from './hooks/useAppStore';
import { useWorkspaceContext } from './context/WorkspaceContext';
import { NavHeader } from './components/NavHeader';
import { Landing, Files, SourceControl, Prompts } from './pages';
import './index.css';

function App() {
  const { state: appState, saveTheme } = useAppStore();
  const { workspacePath, openWorkspace, closeWorkspace } = useWorkspaceContext();
  const themeClass = themes.find((t) => t.id === appState.theme)?.className ?? '';

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden ${themeClass}`}
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <NavHeader
        currentTheme={appState.theme}
        onThemeChange={saveTheme}
        workspacePath={workspacePath}
        recentFolders={appState.recentFolders}
        onFolderSelect={openWorkspace}
        onCloseWorkspace={closeWorkspace}
      />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/files" element={<Files />} />
        <Route path="/source-control" element={<SourceControl />} />
        <Route path="/prompts" element={<Prompts />} />
      </Routes>
    </div>
  );
}

export default App;
