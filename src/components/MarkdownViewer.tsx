import { forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { getShikiThemes, type ThemeId } from '../themes';

interface MarkdownViewerProps {
  content: string;
  isStreaming?: boolean;
  themeClassName?: string;
  themeId?: ThemeId;
  fontSize?: number;
}

export interface MarkdownViewerHandle {
  getHtml: () => string;
}

export const MarkdownViewer = forwardRef<MarkdownViewerHandle, MarkdownViewerProps>(function MarkdownViewer({ content, isStreaming = false, themeId = 'default', fontSize = 100 }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Create code plugin with theme-specific Shiki configuration
  const codePlugin = useMemo(() => {
    const [lightTheme, darkTheme] = getShikiThemes(themeId);
    return createCodePlugin({
      themes: [lightTheme, darkTheme],
    });
  }, [themeId]);

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

  return (
    <article ref={containerRef} className="prose prose-lg max-w-none p-8" style={{ zoom: fontSize / 100 }}>
      <Streamdown
        isAnimating={isStreaming}
        caret={isStreaming ? 'block' : undefined}
        parseIncompleteMarkdown={true}
        className="streamdown-content"
        plugins={{ code: codePlugin }}
      >
        {content}
      </Streamdown>
    </article>
  );
});
