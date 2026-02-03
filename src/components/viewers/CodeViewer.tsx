import { useEffect, useState, useMemo } from 'react';
import { codeToHtml, bundledLanguages } from 'shiki';
import { createCssVariablesTheme } from 'shiki';

interface CodeViewerProps {
  content: string;
  filePath: string;
  fontSize?: number;
}

// Create a single CSS variables theme - colors defined in each theme's CSS
const cssVarsTheme = createCssVariablesTheme({
  name: 'css-variables',
  variablePrefix: '--shiki-',
  variableDefaults: {},
  fontStyle: true,
});

// Map file extensions to Shiki language identifiers
const extensionToLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  mjs: 'javascript',
  cjs: 'javascript',
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
  // Backend
  py: 'python',
  rb: 'ruby',
  php: 'php',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  go: 'go',
  rs: 'rust',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  // Config/Data
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  // Markdown
  md: 'markdown',
  mdx: 'mdx',
  // SQL
  sql: 'sql',
  // Docker
  dockerfile: 'dockerfile',
  // Other
  graphql: 'graphql',
  gql: 'graphql',
  lua: 'lua',
  r: 'r',
  R: 'r',
  perl: 'perl',
  pl: 'perl',
  hs: 'haskell',
  elm: 'elm',
  clj: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  make: 'makefile',
  Makefile: 'makefile',
  cmake: 'cmake',
  vim: 'viml',
  tex: 'latex',
  diff: 'diff',
  prisma: 'prisma',
  astro: 'astro',
};

function getLanguageFromPath(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';

  // Handle special filenames
  if (fileName === 'Dockerfile' || fileName.startsWith('Dockerfile.')) return 'dockerfile';
  if (fileName === 'Makefile' || fileName === 'makefile') return 'makefile';
  if (fileName === '.gitignore' || fileName === '.dockerignore') return 'gitignore';
  if (fileName === '.env' || fileName.startsWith('.env.')) return 'dotenv';

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const lang = extensionToLanguage[ext];

  // Check if the language is available in Shiki
  if (lang && lang in bundledLanguages) {
    return lang;
  }

  // Fallback to plaintext
  return 'text';
}

export function CodeViewer({ content, filePath, fontSize = 100 }: CodeViewerProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const language = useMemo(() => getLanguageFromPath(filePath), [filePath]);
  const lineCount = useMemo(() => content.split('\n').length, [content]);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      setIsLoading(true);
      setError(null);

      try {
        const html = await codeToHtml(content, {
          lang: language,
          theme: cssVarsTheme,
        });

        if (!cancelled) {
          setHighlightedHtml(html);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Shiki highlighting error:', err);
          setError(err instanceof Error ? err.message : 'Failed to highlight code');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [content, language]);

  // Generate line numbers
  const lineNumbers = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => i + 1);
  }, [lineCount]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    // Fallback to plain text display
    return (
      <div className="code-viewer h-full overflow-auto" style={{ zoom: fontSize / 100 }}>
        <div className="flex">
          <div
            className="line-numbers select-none text-right pr-4 pl-4 py-4"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              lineHeight: '1.7',
              minWidth: '3rem',
              borderRight: '1px solid var(--border)',
            }}
          >
            {lineNumbers.map((num) => (
              <div key={num}>{num}</div>
            ))}
          </div>
          <pre
            className="flex-1 p-4 m-0 overflow-x-auto"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              lineHeight: '1.7',
            }}
          >
            <code>{content}</code>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="code-viewer h-full overflow-auto" style={{ zoom: fontSize / 100 }}>
      <div className="flex">
        <div
          className="line-numbers select-none text-right pr-4 pl-4 py-4 sticky left-0"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            lineHeight: '1.7',
            minWidth: '3rem',
            borderRight: '1px solid var(--border)',
          }}
        >
          {lineNumbers.map((num) => (
            <div key={num}>{num}</div>
          ))}
        </div>
        <div
          className="code-content flex-1 py-4 overflow-x-auto"
          style={{
            backgroundColor: 'var(--bg-secondary)',
          }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </div>
    </div>
  );
}
