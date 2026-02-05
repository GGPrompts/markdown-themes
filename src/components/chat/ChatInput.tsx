import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  isGenerating?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, onStop, isGenerating = false, disabled = false, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }, [value]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isGenerating || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isGenerating, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div
      className="flex items-end gap-2 p-3 border-t"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Send a message...'}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none text-sm outline-none px-3 py-2 min-h-[36px]"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      />

      {isGenerating ? (
        <button
          onClick={onStop}
          className="flex items-center justify-center w-9 h-9 shrink-0 transition-colors hover:opacity-80"
          style={{
            backgroundColor: '#ef4444',
            color: '#fff',
            borderRadius: 'var(--radius)',
          }}
          title="Stop generation"
        >
          <Square className="w-4 h-4" fill="currentColor" />
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="flex items-center justify-center w-9 h-9 shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-primary)',
            borderRadius: 'var(--radius)',
          }}
          title="Send message (Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
