import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Folder, Bot } from 'lucide-react';
import { ThemeSelector } from './ThemeSelector';
import { ProjectSelector } from './ProjectSelector';
import { useAIChatContext } from '../context/AIChatContext';
import type { ThemeId } from '../themes';

interface NavHeaderProps {
  currentTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  workspacePath: string | null;
  recentFolders: string[];
  onFolderSelect: (path: string) => void;
  onCloseWorkspace: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, iconOnly: true },
  { to: '/files', label: 'Files', icon: Folder },
];

export function NavHeader({
  currentTheme,
  onThemeChange,
  workspacePath,
  recentFolders,
  onFolderSelect,
  onCloseWorkspace,
}: NavHeaderProps) {
  const { isGenerating } = useAIChatContext();
  const navigate = useNavigate();

  return (
    <header
      className="h-12 flex items-center justify-between px-4 select-none shrink-0"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left: Navigation */}
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isActive ? 'nav-link-active' : 'nav-link'
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive
                  ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                  : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              })}
              title={item.iconOnly ? item.label : undefined}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {!item.iconOnly && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Right: AI status, Project selector and Theme selector */}
      <div className="flex items-center gap-3">
        {isGenerating && (
          <button
            onClick={() => navigate('/files')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              color: 'var(--accent)',
            }}
            title="AI is generating — click to view"
          >
            <Bot className="w-3.5 h-3.5" />
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
          </button>
        )}
        <ProjectSelector
          currentPath={workspacePath}
          recentFolders={recentFolders}
          onFolderSelect={onFolderSelect}
          onClose={onCloseWorkspace}
        />
        <ThemeSelector currentTheme={currentTheme} onThemeChange={onThemeChange} />
      </div>
    </header>
  );
}
