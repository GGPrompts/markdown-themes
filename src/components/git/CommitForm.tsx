import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';

interface CommitFormProps {
  onCommit: (message: string) => Promise<void>;
  onStageAll?: () => Promise<void>;
  onGenerateMessage?: () => Promise<string>;
  hasUnstaged: boolean;
  hasStaged: boolean;
  loading?: string | null;
}

export function CommitForm({
  onCommit,
  onStageAll,
  onGenerateMessage,
  hasUnstaged,
  hasStaged,
  loading,
}: CommitFormProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isCommitting = loading === 'commit';
  const isStaging = loading === 'stage';
  const isGenerating = loading === 'generate';

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Calculate rows based on content (min 4, max 12)
    const lineHeight = 22; // approximate line height in pixels
    const minRows = 4;
    const maxRows = 12;
    const paddingY = 24; // py-3 = 12px top + 12px bottom

    const contentHeight = textarea.scrollHeight - paddingY;
    const rows = Math.max(minRows, Math.min(maxRows, Math.ceil(contentHeight / lineHeight)));

    textarea.style.height = `${rows * lineHeight + paddingY}px`;
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isCommitting) return;

    try {
      await onCommit(message.trim());
      setMessage('');
    } catch {
      // Error handled by parent
    }
  };

  const handleGenerate = async () => {
    if (!onGenerateMessage || isGenerating) return;
    try {
      const generated = await onGenerateMessage();
      setMessage(generated);
    } catch {
      // Error handled by parent
    }
  };

  const canCommit = hasStaged && message.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter commit message..."
          className="w-full px-4 py-3 pr-12 rounded-lg text-sm resize-none focus:outline-none font-mono overflow-y-auto"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
          rows={4}
          disabled={isCommitting || isGenerating}
        />

        {/* AI Generate button */}
        {onGenerateMessage && hasStaged && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || isCommitting}
            className="absolute right-3 top-3 p-2 rounded-lg transition-colors disabled:opacity-50"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            title="Generate commit message with AI"
          >
            {isGenerating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Stage all button if there are unstaged changes */}
        {hasUnstaged && onStageAll && (
          <button
            type="button"
            onClick={onStageAll}
            disabled={isStaging || isCommitting}
            className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-secondary) 80%, var(--bg-primary))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            }}
          >
            {isStaging && <Loader2 className="w-4 h-4 animate-spin" />}
            Stage All
          </button>
        )}

        <button
          type="submit"
          disabled={!canCommit || isCommitting}
          className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
          style={{
            minWidth: '120px',
            justifyContent: 'center',
            backgroundColor: canCommit ? 'var(--accent)' : 'var(--bg-secondary)',
            color: canCommit ? 'white' : 'var(--text-secondary)',
            border: canCommit ? 'none' : '1px solid var(--border)',
          }}
          onMouseEnter={(e) => {
            if (canCommit) {
              e.currentTarget.style.backgroundColor = 'var(--accent-hover, var(--accent))';
            }
          }}
          onMouseLeave={(e) => {
            if (canCommit) {
              e.currentTarget.style.backgroundColor = 'var(--accent)';
            }
          }}
        >
          {isCommitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Commit
        </button>
      </div>

      {!hasStaged && message.trim() && (
        <p
          className="text-sm px-2"
          style={{ color: '#fbbf24' }}
        >
          Stage some changes before committing
        </p>
      )}
    </form>
  );
}
