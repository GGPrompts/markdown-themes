import { useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import type { BundledTheme } from 'shiki';

// Theme to Shiki theme mapping
// Each app theme maps to appropriate light/dark Shiki themes
// The tuple is [light, dark] - we use the same theme for both since
// each app theme has a consistent light/dark mode
const themeToShikiThemes: Record<string, [BundledTheme, BundledTheme]> = {
  'default': ['github-light', 'github-dark'],
  '': ['github-light', 'github-dark'], // fallback for empty className
  'theme-dark-academia': ['rose-pine-moon', 'rose-pine-moon'],
  'theme-cyberpunk': ['synthwave-84', 'synthwave-84'],
  'theme-parchment': ['github-light', 'github-light'],
  'theme-cosmic': ['tokyo-night', 'tokyo-night'],
  'theme-noir': ['min-dark', 'min-dark'],
  'theme-nordic': ['github-light', 'github-light'], // Light theme - soft minimal
  'theme-glassmorphism': ['poimandres', 'poimandres'], // Purple/blue tones
  'theme-retro-futurism': ['snazzy-light', 'snazzy-light'], // Colorful light theme
  'theme-art-deco': ['vitesse-dark', 'vitesse-dark'], // Gold tones on dark
};

interface MarkdownViewerProps {
  content: string;
  isStreaming?: boolean;
  themeClassName?: string;
}

export interface MarkdownViewerHandle {
  /** Get the rendered HTML content */
  getHtml: () => string;
}

export const MarkdownViewer = forwardRef<MarkdownViewerHandle, MarkdownViewerProps>(function MarkdownViewer({ content, isStreaming = false, themeClassName = '' }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose getHtml method via ref
  useImperativeHandle(ref, () => ({
    getHtml: () => {
      if (containerRef.current) {
        // Get the inner content of the streamdown wrapper
        const streamdownContent = containerRef.current.querySelector('.streamdown-content');
        return streamdownContent?.innerHTML ?? containerRef.current.innerHTML;
      }
      return '';
    },
  }), []);
  // Get the appropriate Shiki themes based on current app theme
  const shikiThemes = themeToShikiThemes[themeClassName] || themeToShikiThemes['default'];

  // Create code plugin with theme-specific configuration, memoized to avoid recreation
  const codePlugin = useMemo(() => createCodePlugin({
    themes: shikiThemes,
  }), [shikiThemes[0], shikiThemes[1]]);

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        <p>Open a markdown file to get started</p>
      </div>
    );
  }

  return (
    <article ref={containerRef} className="prose prose-lg max-w-none p-8">
      <Streamdown
        plugins={{ code: codePlugin }}
        isAnimating={isStreaming}
        caret={isStreaming ? 'block' : undefined}
        parseIncompleteMarkdown={true}
        className="streamdown-content"
        shikiTheme={shikiThemes}
      >
        {content}
      </Streamdown>
    </article>
  );
});
