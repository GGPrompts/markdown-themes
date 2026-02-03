import { useMemo } from 'react';
import { MarkdownViewer } from './MarkdownViewer';
import { CodeViewer } from './viewers/CodeViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { CsvViewer } from './viewers/CsvViewer';
import { JsonViewer } from './viewers/JsonViewer';

interface ViewerContainerProps {
  filePath: string;
  content: string;
  isStreaming?: boolean;
  themeClassName?: string;
  fontSize?: number;
}

type ViewerType = 'markdown' | 'code' | 'image' | 'csv' | 'json';

// Extensions for each viewer type
const markdownExtensions = new Set(['md', 'markdown', 'mdx']);
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);
const csvExtensions = new Set(['csv', 'tsv']);
const jsonExtensions = new Set(['json', 'jsonc', 'json5']);

function getViewerType(filePath: string): ViewerType {
  const fileName = filePath.split('/').pop() || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (markdownExtensions.has(ext)) {
    return 'markdown';
  }

  if (imageExtensions.has(ext)) {
    return 'image';
  }

  if (csvExtensions.has(ext)) {
    return 'csv';
  }

  if (jsonExtensions.has(ext)) {
    return 'json';
  }

  // Default to code viewer for any text file
  return 'code';
}

export function ViewerContainer({
  filePath,
  content,
  isStreaming = false,
  themeClassName = '',
  fontSize = 100,
}: ViewerContainerProps) {
  const viewerType = useMemo(() => getViewerType(filePath), [filePath]);

  switch (viewerType) {
    case 'markdown':
      return (
        <MarkdownViewer
          content={content}
          isStreaming={isStreaming}
          themeClassName={themeClassName}
          fontSize={fontSize}
        />
      );

    case 'image':
      return <ImageViewer filePath={filePath} fontSize={fontSize} />;

    case 'csv':
      return <CsvViewer content={content} fontSize={fontSize} />;

    case 'json':
      return <JsonViewer content={content} fontSize={fontSize} />;

    case 'code':
    default:
      return <CodeViewer content={content} filePath={filePath} fontSize={fontSize} />;
  }
}
