import { useMemo, forwardRef, useImperativeHandle, useRef, useState, useEffect, Component, ReactNode } from 'react';
import { Streamdown } from 'streamdown';
import type { BundledTheme } from 'shiki';

// Theme to Shiki theme mapping
const themeToShikiThemes: Record<string, [BundledTheme, BundledTheme]> = {
  'default': ['github-light', 'github-dark'],
  '': ['github-light', 'github-dark'],
  'theme-dark-academia': ['rose-pine-moon', 'rose-pine-moon'],
  'theme-cyberpunk': ['synthwave-84', 'synthwave-84'],
  'theme-parchment': ['github-light', 'github-light'],
  'theme-cosmic': ['tokyo-night', 'tokyo-night'],
  'theme-noir': ['min-dark', 'min-dark'],
  'theme-nordic': ['github-light', 'github-light'],
  'theme-glassmorphism': ['poimandres', 'poimandres'],
  'theme-retro-futurism': ['snazzy-light', 'snazzy-light'],
  'theme-art-deco': ['vitesse-dark', 'vitesse-dark'],
};

// Error boundary to catch rendering errors
class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('MarkdownViewer error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface MarkdownViewerProps {
  content: string;
  isStreaming?: boolean;
  themeClassName?: string;
}

export interface MarkdownViewerHandle {
  getHtml: () => string;
}

export const MarkdownViewer = forwardRef<MarkdownViewerHandle, MarkdownViewerProps>(function MarkdownViewer({ content, isStreaming = false, themeClassName = '' }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [codePlugin, setCodePlugin] = useState<unknown>(null);
  const [pluginError, setPluginError] = useState(false);

  // Get the appropriate Shiki themes
  const shikiThemes = themeToShikiThemes[themeClassName] || themeToShikiThemes['default'];

  // Lazy load the code plugin
  useEffect(() => {
    let mounted = true;

    const loadPlugin = async () => {
      try {
        const { createCodePlugin } = await import('@streamdown/code');
        if (mounted) {
          const plugin = createCodePlugin({ themes: shikiThemes });
          setCodePlugin(plugin);
        }
      } catch (err) {
        console.error('Failed to load code plugin:', err);
        if (mounted) {
          setPluginError(true);
        }
      }
    };

    loadPlugin();

    return () => {
      mounted = false;
    };
  }, [shikiThemes[0], shikiThemes[1]]);

  // Expose getHtml method via ref
  useImperativeHandle(ref, () => ({
    getHtml: () => {
      if (containerRef.current) {
        const streamdownContent = containerRef.current.querySelector('.streamdown-content');
        return streamdownContent?.innerHTML ?? containerRef.current.innerHTML;
      }
      return '';
    },
  }), []);

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        <p>Open a markdown file to get started</p>
      </div>
    );
  }

  const fallback = (
    <article ref={containerRef} className="prose prose-lg max-w-none p-8">
      <div style={{ color: 'var(--text-secondary)' }}>
        <p>Error rendering markdown. Raw content:</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{content}</pre>
      </div>
    </article>
  );

  // Build plugins object only if code plugin loaded successfully
  const plugins = codePlugin && !pluginError ? { code: codePlugin } : undefined;

  return (
    <ErrorBoundary fallback={fallback}>
      <article ref={containerRef} className="prose prose-lg max-w-none p-8">
        <Streamdown
          plugins={plugins}
          isAnimating={isStreaming}
          caret={isStreaming ? 'block' : undefined}
          parseIncompleteMarkdown={true}
          className="streamdown-content"
          shikiTheme={plugins ? shikiThemes : undefined}
        >
          {content}
        </Streamdown>
      </article>
    </ErrorBoundary>
  );
});
