import { useMemo, type RefObject } from 'react';
import { FileWarning } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { CodeViewer } from './viewers/CodeViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { CsvViewer } from './viewers/CsvViewer';
import { JsonViewer } from './viewers/JsonViewer';
import { JsonlViewer } from './viewers/JsonlViewer';
import { ConversationMarkdownViewer } from './viewers/ConversationMarkdownViewer';
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
  /** Repository root path for git diff highlighting */
  repoPath?: string | null;
  /** Callback to send content to AI Chat */
  onSendToChat?: (content: string) => void;
  /** Ref to the parent scroll container for CodeViewer scrollbar markers */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

type ViewerType = 'markdown' | 'code' | 'image' | 'csv' | 'json' | 'jsonl' | 'convlog' | 'audio' | 'video' | 'svg' | 'pdf' | 'prompty' | 'binary';

// Extensions for each viewer type
const markdownExtensions = new Set(['md', 'markdown', 'mdx']);
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif']);
const csvExtensions = new Set(['csv', 'tsv']);
const jsonExtensions = new Set(['json', 'jsonc', 'json5']);
const jsonlExtensions = new Set(['jsonl', 'ndjson']);
const convlogExtensions = new Set(['convlog']);
const audioExtensions = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma']);
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'ogg', 'mkv', 'm4v', 'avi']);
const svgExtensions = new Set(['svg']);
const pdfExtensions = new Set(['pdf']);

// Binary file extensions that shouldn't be displayed as text
const binaryExtensions = new Set([
  // Compiled/executable
  'exe', 'dll', 'so', 'dylib', 'a', 'o', 'obj', 'lib', 'bin',
  // Archives
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // Other binary formats
  'pyc', 'pyo', 'class', 'jar', 'war',
]);

// Known binary filenames (no extension)
const binaryFilenames = new Set([
  'markdown-themes-backend', // Our compiled Go binary
]);

/**
 * Check if content appears to be binary (contains null bytes or high ratio of non-printable chars)
 */
function isBinaryContent(content: string): boolean {
  if (!content || content.length === 0) return false;

  // Check first 8KB for binary indicators
  const sample = content.slice(0, 8192);

  // Null bytes are a strong indicator of binary content
  if (sample.includes('\0')) return true;

  // Count non-printable characters (excluding common whitespace)
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Allow tabs, newlines, carriage returns, and printable ASCII
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
    // Characters above 127 in large quantities suggest binary
    if (code > 127) {
      nonPrintable++;
    }
  }

  // If more than 10% non-printable, likely binary
  return nonPrintable / sample.length > 0.1;
}

function getViewerType(filePath: string, content?: string): ViewerType {
  const fileName = filePath.split('/').pop() || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // Check for known binary filenames first
  if (binaryFilenames.has(fileName)) {
    return 'binary';
  }

  // Check for binary extensions
  if (binaryExtensions.has(ext)) {
    return 'binary';
  }

  // For files without extensions, check content for binary data
  if (!fileName.includes('.') && content && isBinaryContent(content)) {
    return 'binary';
  }

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

  // Check for conversation logs (.convlog or JSONL files in ~/.claude/projects/)
  if (convlogExtensions.has(ext)) {
    return 'convlog';
  }

  // JSONL files from Claude projects directory are conversation logs
  if (jsonlExtensions.has(ext) && filePath.includes('/.claude/projects/')) {
    return 'convlog';
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
  repoPath = null,
  onSendToChat,
  scrollContainerRef,
}: ViewerContainerProps) {
  const viewerType = useMemo(() => getViewerType(filePath, content), [filePath, content]);

  switch (viewerType) {
    case 'markdown':
      return (
        <MarkdownViewer
          content={content}
          isStreaming={isStreaming}
          themeClassName={themeClassName}
          fontSize={fontSize}
          filePath={filePath}
          repoPath={repoPath}
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

    case 'convlog':
      return (
        <ConversationMarkdownViewer
          content={content}
          filePath={filePath}
          fontSize={fontSize}
          themeClassName={themeClassName}
          isStreaming={isStreaming}
        />
      );

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
          onSendToChat={onSendToChat}
        />
      );

    case 'binary':
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <FileWarning size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 16px' }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Binary File
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              This file contains binary data and cannot be displayed as text.
            </p>
            <p className="text-xs mt-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
              {filePath.split('/').pop()}
            </p>
          </div>
        </div>
      );

    case 'code':
    default:
      return <CodeViewer content={content} filePath={filePath} fontSize={fontSize} isStreaming={isStreaming} repoPath={repoPath} scrollContainerRef={scrollContainerRef} />;
  }
}
