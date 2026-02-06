import type { LucideIcon } from 'lucide-react';
import {
  FileCode,
  FileText,
  FileJson,
  FileImage,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  File,
  FileType,
  FileCog,
  FileInput,
} from 'lucide-react';

// File type categories
type FileCategory = 'code' | 'markdown' | 'json' | 'config' | 'image' | 'video' | 'audio' | 'data' | 'text' | 'prompt' | 'unknown';

interface FileIconInfo {
  icon: LucideIcon;
  color: string;
  category: FileCategory;
}

// Colors that work well on both light and dark themes
const ICON_COLORS = {
  code: '#22c55e',      // Green - code files
  markdown: '#3b82f6',  // Blue - markdown, docs
  json: '#f97316',      // Orange - JSON
  config: '#f97316',    // Orange - config files
  image: '#eab308',     // Yellow - images
  video: '#a855f7',     // Purple - video
  audio: '#ec4899',     // Pink - audio files
  data: '#10b981',      // Emerald - CSV, data files
  text: '#6b7280',      // Gray - text files
  prompt: '#8b5cf6',    // Violet - prompt/template files
  unknown: '#6b7280',   // Gray - unknown
} as const;

// Code file extensions
const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'pyw',
  'rb',
  'java', 'kt', 'kts', 'scala',
  'cpp', 'c', 'cc', 'cxx', 'h', 'hpp', 'hxx',
  'cs',
  'php',
  'go',
  'rs',
  'swift',
  'r',
  'sql',
  'sh', 'bash', 'zsh', 'fish', 'ps1',
  'lua',
  'perl', 'pl',
  'elm',
  'clj', 'cljs', 'cljc',
  'ex', 'exs',
  'erl',
  'hs',
  'ml', 'mli',
  'fs', 'fsi', 'fsx',
  'dart',
  'vue', 'svelte',
  'html', 'htm',
  'css', 'scss', 'sass', 'less', 'styl',
  'xml', 'xsl', 'xslt',
  'graphql', 'gql',
  'vim',
  'tex', 'latex',
  'diff', 'patch',
]);

// Markdown and documentation extensions
const MARKDOWN_EXTENSIONS = new Set([
  'md', 'markdown', 'mdx', 'rst', 'txt', 'adoc', 'asciidoc',
]);

// JSON and data format extensions
const JSON_EXTENSIONS = new Set([
  'json', 'jsonc', 'json5', 'jsonl',
]);

// Config file extensions
const CONFIG_EXTENSIONS = new Set([
  'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env', 'properties',
  'editorconfig', 'prettierrc', 'eslintrc', 'babelrc',
]);

// Image extensions
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff', 'tif', 'avif',
]);

// Video extensions
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'm4v', 'wmv', 'flv',
]);

// Audio extensions
const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'aiff', 'ape',
]);

// Data file extensions
const DATA_EXTENSIONS = new Set([
  'csv', 'tsv', 'xls', 'xlsx', 'ods', 'parquet', 'arrow',
]);

// Special filenames (case-insensitive)
const SPECIAL_FILENAMES: Record<string, FileCategory> = {
  'dockerfile': 'code',
  'makefile': 'code',
  'gnumakefile': 'code',
  'rakefile': 'code',
  'gemfile': 'code',
  'package.json': 'json',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
  '.gitignore': 'config',
  '.gitattributes': 'config',
  '.dockerignore': 'config',
  '.npmrc': 'config',
  '.nvmrc': 'config',
  '.env': 'config',
  '.env.local': 'config',
  '.env.development': 'config',
  '.env.production': 'config',
  'readme': 'markdown',
  'changelog': 'markdown',
  'license': 'text',
};

/**
 * Get file category from filename/extension
 */
function getFileCategory(filePath: string): FileCategory {
  const fileName = filePath.split('/').pop()?.split('\\').pop() ?? '';
  const lowerName = fileName.toLowerCase();

  // Check special filenames first
  if (SPECIAL_FILENAMES[lowerName]) {
    return SPECIAL_FILENAMES[lowerName];
  }

  // Get extension
  const ext = fileName.includes('.')
    ? fileName.split('.').pop()?.toLowerCase() ?? ''
    : '';

  // Check by extension
  if (ext === 'prompty') return 'prompt';
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (JSON_EXTENSIONS.has(ext)) return 'json';
  if (CONFIG_EXTENSIONS.has(ext)) return 'config';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (DATA_EXTENSIONS.has(ext)) return 'data';

  // Files without extension or unknown
  return 'unknown';
}

/**
 * Get the appropriate Lucide icon for a file category
 */
function getIconForCategory(category: FileCategory): LucideIcon {
  switch (category) {
    case 'code':
      return FileCode;
    case 'markdown':
      return FileText;
    case 'json':
      return FileJson;
    case 'config':
      return FileCog;
    case 'image':
      return FileImage;
    case 'video':
      return FileVideo;
    case 'audio':
      return FileAudio;
    case 'data':
      return FileSpreadsheet;
    case 'prompt':
      return FileInput;
    case 'text':
      return FileType;
    case 'unknown':
    default:
      return File;
  }
}

/**
 * Get icon info (icon component and color) for a file path
 */
export function getFileIconInfo(filePath: string): FileIconInfo {
  const category = getFileCategory(filePath);
  return {
    icon: getIconForCategory(category),
    color: ICON_COLORS[category],
    category,
  };
}

/**
 * Get just the color for a file path (useful when using custom icons)
 */
export function getFileColor(filePath: string): string {
  const category = getFileCategory(filePath);
  return ICON_COLORS[category];
}

/**
 * Export colors for use in components
 */
export { ICON_COLORS };
