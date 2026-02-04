import { useMemo } from 'react';
import { MarkdownViewer } from './MarkdownViewer';
import { CodeViewer } from './viewers/CodeViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { CsvViewer } from './viewers/CsvViewer';
import { JsonViewer } from './viewers/JsonViewer';
import { JsonlViewer } from './viewers/JsonlViewer';
import { AudioViewer } from './viewers/AudioViewer';
import { VideoViewer } from './viewers/VideoViewer';
import { SvgViewer } from './viewers/SvgViewer';
import { PdfViewer } from './viewers/PdfViewer';
import { PromptNotebook } from './PromptNotebook';
import { isPromptyFile } from '../utils/promptyUtils';

interface ViewerContainerProps {
  filePath: string;
  content: string;
  isStreaming?: boolean;
  themeClassName?: string;
  fontSize?: number;
}

type ViewerType = 'markdown' | 'code' | 'image' | 'csv' | 'json' | 'jsonl' | 'audio' | 'video' | 'svg' | 'pdf' | 'prompty';

// Extensions for each viewer type
const markdownExtensions = new Set(['md', 'markdown', 'mdx']);
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif']);
const csvExtensions = new Set(['csv', 'tsv']);
const jsonExtensions = new Set(['json', 'jsonc', 'json5']);
const jsonlExtensions = new Set(['jsonl', 'ndjson']);
const audioExtensions = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma']);
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'ogg', 'mkv', 'm4v', 'avi']);
const svgExtensions = new Set(['svg']);
const pdfExtensions = new Set(['pdf']);

function getViewerType(filePath: string): ViewerType {
  const fileName = filePath.split('/').pop() || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (markdownExtensions.has(ext)) {
    return 'markdown';
  }

  // Check SVG before generic images (SVG has special viewer with source toggle)
  if (svgExtensions.has(ext)) {
    return 'svg';
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

  if (jsonlExtensions.has(ext)) {
    return 'jsonl';
  }

  if (audioExtensions.has(ext)) {
    return 'audio';
  }

  if (videoExtensions.has(ext)) {
    return 'video';
  }

  if (pdfExtensions.has(ext)) {
    return 'pdf';
  }

  if (isPromptyFile(filePath)) {
    return 'prompty';
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

    case 'jsonl':
      return <JsonlViewer content={content} fontSize={fontSize} />;

    case 'audio':
      return <AudioViewer filePath={filePath} />;

    case 'video':
      return <VideoViewer filePath={filePath} fontSize={fontSize} />;

    case 'svg':
      return <SvgViewer filePath={filePath} content={content} fontSize={fontSize} />;

    case 'pdf':
      return <PdfViewer filePath={filePath} fontSize={fontSize} />;

    case 'prompty':
      return (
        <PromptNotebook
          content={content}
          path={filePath}
          fontSize={fontSize}
          isStreaming={isStreaming}
        />
      );

    case 'code':
    default:
      return <CodeViewer content={content} filePath={filePath} fontSize={fontSize} />;
  }
}
