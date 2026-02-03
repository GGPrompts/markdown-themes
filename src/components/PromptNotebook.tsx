import { useState, useMemo, useCallback } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { createCssVariablesTheme } from 'shiki';
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  parsePrompty,
  getFieldProgress,
  getFieldOrder,
  getPromptForSending,
  type VariableInfo,
  type PromptyFrontmatter,
} from '../utils/promptyUtils';
import { InlineField } from './InlineField';

interface PromptNotebookProps {
  content: string;
  path?: string;  // Used for display purposes
  fontSize?: number;
  isStreaming?: boolean;
}

// Create a single CSS variables theme - colors defined in each theme's CSS
const cssVarsTheme = createCssVariablesTheme({
  name: 'css-variables',
  variablePrefix: '--shiki-',
  variableDefaults: {},
  fontStyle: true,
});

export function PromptNotebook({
  content,
  path: _path,  // eslint-disable-line @typescript-eslint/no-unused-vars
  fontSize = 100,
  isStreaming = false,
}: PromptNotebookProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [activeFieldIndex, setActiveFieldIndex] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [showFrontmatter, setShowFrontmatter] = useState(true);

  // Parse the prompty file
  const parsed = useMemo(() => parsePrompty(content), [content]);

  // Get ordered list of field names (for tab navigation)
  const fieldOrder = useMemo(() => getFieldOrder(parsed.content), [parsed.content]);

  // Create variable info map for quick lookup
  const variableMap = useMemo(() => {
    const map = new Map<string, VariableInfo>();
    parsed.variables.forEach((v) => map.set(v.name, v));
    return map;
  }, [parsed.variables]);

  // Progress tracking
  const progress = useMemo(
    () => getFieldProgress(parsed.variables, variableValues),
    [parsed.variables, variableValues]
  );

  // Create code plugin with CSS variables theme
  const codePlugin = useMemo(() => {
    return createCodePlugin({
      // @ts-expect-error - cssVarsTheme is ThemeRegistration, plugin expects BundledTheme but accepts custom themes
      themes: [cssVarsTheme, cssVarsTheme],
    });
  }, []);

  const handleFieldChange = useCallback((fieldId: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  // Tab navigation between fields
  const handleNavigate = useCallback(
    (currentFieldId: string, direction: 'next' | 'prev') => {
      const currentIndex = fieldOrder.indexOf(currentFieldId);
      let nextIndex: number;

      if (direction === 'next') {
        if (currentIndex >= fieldOrder.length - 1) {
          setActiveFieldIndex(null);
          return;
        }
        nextIndex = currentIndex + 1;
      } else {
        if (currentIndex <= 0) {
          setActiveFieldIndex(null);
          return;
        }
        nextIndex = currentIndex - 1;
      }

      setActiveFieldIndex(nextIndex);
      setTimeout(() => setActiveFieldIndex(null), 100);
    },
    [fieldOrder]
  );

  // Copy processed content to clipboard
  const handleCopy = async () => {
    const processed = getPromptForSending(content, variableValues);
    await navigator.clipboard.writeText(processed);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus('idle'), 2000);
  };

  // Helper to render text with inline fields
  const renderTextWithFields = useCallback(
    (text: string): React.ReactNode => {
      const fieldRegex = /\{\{([^:}]+)(?::([^}]+))?\}\}/g;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;
      let key = 0;

      while ((match = fieldRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }

        const fieldName = match[1].trim();
        const varInfo = variableMap.get(fieldName);
        const fieldIdx = fieldOrder.indexOf(fieldName);

        parts.push(
          <InlineField
            key={`field-${fieldName}-${key++}`}
            fieldId={fieldName}
            hint={varInfo?.hint}
            options={varInfo?.options}
            value={variableValues[fieldName] || ''}
            onChange={handleFieldChange}
            onNavigate={(direction) => handleNavigate(fieldName, direction)}
            isActive={activeFieldIndex === fieldIdx}
          />
        );

        lastIndex = fieldRegex.lastIndex;
      }

      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
      }

      return parts.length === 0 ? text : parts.length === 1 ? parts[0] : <>{parts}</>;
    },
    [fieldOrder, variableValues, handleFieldChange, handleNavigate, activeFieldIndex, variableMap]
  );

  // Custom Streamdown components to handle {{variable}} replacement
  // Using 'any' for props to work around strict typing in react-markdown/Streamdown
  const streamdownComponents = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <p {...props}>{renderTextWithFields(children)}</p>;
        }
        return <p {...props}>{children}</p>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      li: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <li {...props}>{renderTextWithFields(children)}</li>;
        }
        return <li {...props}>{children}</li>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h1: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <h1 {...props}>{renderTextWithFields(children)}</h1>;
        }
        return <h1 {...props}>{children}</h1>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h2: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <h2 {...props}>{renderTextWithFields(children)}</h2>;
        }
        return <h2 {...props}>{children}</h2>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h3: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <h3 {...props}>{renderTextWithFields(children)}</h3>;
        }
        return <h3 {...props}>{children}</h3>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h4: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <h4 {...props}>{renderTextWithFields(children)}</h4>;
        }
        return <h4 {...props}>{children}</h4>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blockquote: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <blockquote {...props}>{renderTextWithFields(children)}</blockquote>;
        }
        return <blockquote {...props}>{children}</blockquote>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      strong: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <strong {...props}>{renderTextWithFields(children)}</strong>;
        }
        return <strong {...props}>{children}</strong>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      em: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <em {...props}>{renderTextWithFields(children)}</em>;
        }
        return <em {...props}>{children}</em>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      td: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <td {...props}>{renderTextWithFields(children)}</td>;
        }
        return <td {...props}>{children}</td>;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      th: ({ children, ...props }: any) => {
        if (typeof children === 'string') {
          return <th {...props}>{renderTextWithFields(children)}</th>;
        }
        return <th {...props}>{children}</th>;
      },
    }),
    [renderTextWithFields]
  );

  const hasFrontmatterContent =
    parsed.frontmatter.name || parsed.frontmatter.description || parsed.frontmatter.model;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 p-2 flex-wrap"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors"
          style={{
            backgroundColor:
              copyStatus === 'copied'
                ? 'color-mix(in srgb, #22c55e 20%, transparent)'
                : 'color-mix(in srgb, var(--accent) 10%, transparent)',
            color: copyStatus === 'copied' ? '#22c55e' : 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
          title="Copy prompt with variables filled"
        >
          {copyStatus === 'copied' ? <Check size={16} /> : <Copy size={16} />}
          {copyStatus === 'copied' ? 'Copied!' : 'Copy'}
        </button>

        {/* Progress indicator */}
        {progress.total > 0 && (
          <div
            className="flex items-center gap-1.5 ml-auto text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            {progress.filled === progress.total ? (
              <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
            ) : (
              <AlertCircle
                size={16}
                style={{ color: 'color-mix(in srgb, var(--accent) 60%, transparent)' }}
              />
            )}
            <span>
              {progress.filled}/{progress.total} filled
            </span>
          </div>
        )}
      </div>

      {/* Frontmatter header */}
      {hasFrontmatterContent && (
        <FrontmatterHeader
          frontmatter={parsed.frontmatter}
          isExpanded={showFrontmatter}
          onToggle={() => setShowFrontmatter(!showFrontmatter)}
        />
      )}

      {/* Prompt content with markdown rendering and inline fields */}
      <div className="flex-1 overflow-auto">
        <article className="prose prose-lg max-w-none p-8" style={{ zoom: fontSize / 100 }}>
          <Streamdown
            isAnimating={isStreaming}
            caret={isStreaming ? 'block' : undefined}
            parseIncompleteMarkdown={true}
            className="streamdown-content"
            plugins={{ code: codePlugin }}
            components={streamdownComponents}
          >
            {parsed.content}
          </Streamdown>
        </article>
      </div>
    </div>
  );
}

// Frontmatter header component
interface FrontmatterHeaderProps {
  frontmatter: PromptyFrontmatter;
  isExpanded: boolean;
  onToggle: () => void;
}

function FrontmatterHeader({ frontmatter, isExpanded, onToggle }: FrontmatterHeaderProps) {
  // Get extra fields (excluding name, description, url)
  const extraFields = Object.entries(frontmatter).filter(
    ([key]) => !['name', 'description', 'url'].includes(key) && frontmatter[key]
  );

  return (
    <div
      className="px-4 py-3"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          className="mt-1 p-0.5 rounded transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="flex-1 min-w-0">
          {frontmatter.name && (
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--accent)', margin: 0 }}
            >
              {frontmatter.url ? (
                <a
                  href={frontmatter.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:underline"
                  style={{ color: 'inherit' }}
                >
                  {frontmatter.name}
                  <ExternalLink size={16} style={{ opacity: 0.6 }} />
                </a>
              ) : (
                frontmatter.name
              )}
            </h2>
          )}

          {isExpanded && (
            <>
              {frontmatter.description && (
                <p
                  className="text-sm mt-1"
                  style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}
                >
                  {frontmatter.description}
                </p>
              )}

              {extraFields.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {extraFields.map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center px-2 py-0.5 text-xs rounded"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                        color: 'var(--accent)',
                        border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                      }}
                    >
                      <span style={{ opacity: 0.7 }}>{key}:</span>
                      <span className="ml-1 font-medium">{value}</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export type { PromptNotebookProps };
