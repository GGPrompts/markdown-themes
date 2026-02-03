import { Link } from 'react-router-dom';
import { Folder, GitBranch, BookOpen } from 'lucide-react';

interface NavigationCard {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  route: string;
}

const navigationCards: NavigationCard[] = [
  {
    icon: Folder,
    title: 'Files',
    description: 'Browse and view files with themes',
    route: '/files',
  },
  {
    icon: GitBranch,
    title: 'Source Control',
    description: 'Git operations and batch actions',
    route: '/source-control',
  },
  {
    icon: BookOpen,
    title: 'Prompt Notebook',
    description: 'Create and manage prompts',
    route: '/prompts',
  },
];

export function Landing() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12">
      <div className="text-center mb-16 max-w-2xl">
        <h1
          className="text-5xl font-bold mb-4"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
        >
          Markdown Themes
        </h1>
        <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
          A themed markdown viewer for AI-assisted writing. Watch Claude edit files in real-time
          with beautiful style guide themes.
        </p>
      </div>

      <nav className="w-full max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {navigationCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.route}
                to={card.route}
                className="group flex flex-col items-center p-8 rounded-lg border-2 transition-all duration-300 hover:scale-105"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  borderRadius: 'var(--radius)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  className="mb-4 p-4 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <Icon
                    className="w-12 h-12 transition-colors duration-300"
                    style={{ color: 'var(--accent)' }}
                  />
                </div>
                <h2
                  className="text-2xl font-bold mb-2"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                >
                  {card.title}
                </h2>
                <p
                  className="text-center"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                >
                  {card.description}
                </p>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
