import { Routes, Route } from 'react-router-dom';
import { themes } from './themes';
import { useAppStore } from './hooks/useAppStore';
import { useMouseSpotlight } from './hooks/useMouseSpotlight';
import { NavHeader } from './components/NavHeader';
import { Files } from './pages';
import './index.css';

function App() {
  const { state: appState, saveTheme } = useAppStore();
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
      />
      <Routes>
        <Route path="/" element={<Files />} />
        <Route path="/files" element={<Files />} />
      </Routes>
    </div>
  );
}

export default App;
