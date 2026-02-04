import React, { useState, useMemo, useCallback } from 'react';
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
  MessageSquare,
} from 'lucide-react';
import { queueToChat } from '../lib/api';
import {
  parsePrompty,
  getFieldProgress,
  getFieldOrder,
  getPromptForSending,
  type VariableInfo,
  type PromptyFrontmatter,
} from '../utils/promptyUtils';
import { InlineField } from './InlineField';
import { FilePickerModal } from './FilePickerModal';

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

// Default home path for file picker
const DEFAULT_HOME_PATH = '/home/marci';

export function PromptNotebook({
  content,
  path: _path,  // eslint-disable-line @typescript-eslint/no-unused-vars
  fontSize = 100,
  isStreaming = false,
}: PromptNotebookProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [activeFieldIndex, setActiveFieldIndex] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [showFrontmatter, setShowFrontmatter] = useState(true);

  // File picker modal state
  const [filePickerState, setFilePickerState] = useState<{
    isOpen: boolean;
    mode: 'file' | 'folder';
    callback: ((path: string) => void) | null;
  }>({ isOpen: false, mode: 'file', callback: null });

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

  // File picker handlers
  const handleOpenFilePicker = useCallback((mode: 'file' | 'folder', callback: (path: string) => void) => {
    setFilePickerState({ isOpen: true, mode, callback });
  }, []);

  const handleFilePickerSelect = useCallback((path: string) => {
    if (filePickerState.callback) {
      filePickerState.callback(path);
    }
    setFilePickerState({ isOpen: false, mode: 'file', callback: null });
  }, [filePickerState.callback]);

  const handleFilePickerCancel = useCallback(() => {
    setFilePickerState({ isOpen: false, mode: 'file', callback: null });
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

  // Send processed content to TabzChrome chat
  const handleSendToChat = async () => {
    const processed = getPromptForSending(content, variableValues);
    try {
      await queueToChat(processed);
      setSendStatus('sent');
      setTimeout(() => setSendStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to send to chat:', err);
      setSendStatus('error');
      setTimeout(() => setSendStatus('idle'), 2000);
    }
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
            onOpenFilePicker={handleOpenFilePicker}
          />
        );

        lastIndex = fieldRegex.lastIndex;
      }

      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
      }

      return parts.length === 0 ? text : parts.length === 1 ? parts[0] : <>{parts}</>;
    },
    [fieldOrder, variableValues, handleFieldChange, handleNavigate, activeFieldIndex, variableMap, handleOpenFilePicker]
  );

  // Recursively process children to find and replace template fields
  const processChildren = useCallback(
    (children: React.ReactNode, keyPrefix = ''): React.ReactNode => {
      if (typeof children === 'string') {
        return renderTextWithFields(children);
      }

      if (Array.isArray(children)) {
        return children.map((child, idx) => processChildren(child, `${keyPrefix}-${idx}`));
      }

      // If it's a React element, clone it with processed children
      if (React.isValidElement(children)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elementProps = children.props as any;
        if (elementProps?.children) {
          return React.cloneElement(children, {
            ...elementProps,
            children: processChildren(elementProps.children, keyPrefix),
          });
        }
      }

      return children;
    },
    [renderTextWithFields]
  );

  // Custom Streamdown components to handle {{variable}} replacement
  // Using 'any' for props to work around strict typing in react-markdown/Streamdown
  const streamdownComponents = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p: ({ children, ...props }: any) => <p {...props}>{processChildren(children)}</p>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      li: ({ children, ...props }: any) => <li {...props}>{processChildren(children)}</li>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h1: ({ children, ...props }: any) => <h1 {...props}>{processChildren(children)}</h1>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h2: ({ children, ...props }: any) => <h2 {...props}>{processChildren(children)}</h2>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h3: ({ children, ...props }: any) => <h3 {...props}>{processChildren(children)}</h3>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h4: ({ children, ...props }: any) => <h4 {...props}>{processChildren(children)}</h4>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blockquote: ({ children, ...props }: any) => <blockquote {...props}>{processChildren(children)}</blockquote>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      strong: ({ children, ...props }: any) => <strong {...props}>{processChildren(children)}</strong>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      em: ({ children, ...props }: any) => <em {...props}>{processChildren(children)}</em>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      td: ({ children, ...props }: any) => <td {...props}>{processChildren(children)}</td>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      th: ({ children, ...props }: any) => <th {...props}>{processChildren(children)}</th>,
    }),
    [processChildren]
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

        <button
          onClick={handleSendToChat}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors"
          style={{
            backgroundColor:
              sendStatus === 'sent'
                ? 'color-mix(in srgb, #22c55e 20%, transparent)'
                : sendStatus === 'error'
                ? 'color-mix(in srgb, #ef4444 20%, transparent)'
                : 'color-mix(in srgb, var(--accent) 10%, transparent)',
            color:
              sendStatus === 'sent'
                ? '#22c55e'
                : sendStatus === 'error'
                ? '#ef4444'
                : 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
          title="Send prompt to TabzChrome chat"
        >
          {sendStatus === 'sent' ? <Check size={16} /> : <MessageSquare size={16} />}
          {sendStatus === 'sent' ? 'Sent!' : sendStatus === 'error' ? 'Failed' : 'Send to Chat'}
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

      {/* File Picker Modal */}
      {filePickerState.isOpen && (
        <FilePickerModal
          mode={filePickerState.mode === 'folder' ? 'folder' : 'file'}
          onSelect={handleFilePickerSelect}
          onCancel={handleFilePickerCancel}
          initialPath={DEFAULT_HOME_PATH}
          title={filePickerState.mode === 'folder' ? 'Select Folder' : 'Select File'}
        />
      )}
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
        backgroundColor: 'var(--selection-bg, color-mix(in srgb, var(--accent) 5%, transparent))',
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
              style={{ color: 'var(--selection-text, var(--accent))', margin: 0 }}
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
                        backgroundColor: 'var(--selection-bg, color-mix(in srgb, var(--accent) 15%, transparent))',
                        color: 'var(--selection-text, var(--accent))',
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
