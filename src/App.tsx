import { Routes, Route } from 'react-router-dom';
import { themes } from './themes';
import { useAppStore } from './hooks/useAppStore';
import { useMouseSpotlight } from './hooks/useMouseSpotlight';
import { useWorkspaceContext } from './context/WorkspaceContext';
import { NavHeader } from './components/NavHeader';
import { Landing, Files } from './pages';
import './index.css';

function App() {
  const { state: appState, saveTheme } = useAppStore();
  const { workspacePath, openWorkspace, closeWorkspace } = useWorkspaceContext();
  const themeClass = themes.find((t) => t.id === appState.theme)?.className ?? '';

  // Enable mouse-following spotlight for themes that use it (noir)
  const isNoirTheme = appState.theme === 'noir';
  useMouseSpotlight(isNoirTheme);

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden ${themeClass}`}
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* Mouse-following spotlight overlay for Noir theme */}
      {isNoirTheme && <div className="noir-spotlight" />}
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
      </Routes>
    </div>
  );
}

export default App;
