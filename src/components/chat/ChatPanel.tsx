import { useEffect, useRef, useCallback, useState } from 'react';
import { MessageSquarePlus, Trash2, ChevronLeft, Bot, StopCircle } from 'lucide-react';
import { ChatMessageComponent } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useAIChat, type Conversation } from '../../hooks/useAIChat';

interface ChatPanelProps {
  cwd?: string | null;
  /** Current file path for context */
  currentFile?: string | null;
  /** Current file content for context */
  currentFileContent?: string | null;
  fontSize?: number;
}

export function ChatPanel({ cwd, currentFile, currentFileContent: _currentFileContent, fontSize = 100 }: ChatPanelProps) {
  const {
    conversations,
    activeConversation,
    activeConversationId,
    isGenerating,
    error,
    sendMessage,
    stopGeneration,
    newConversation,
    setActiveConversation,
    deleteConversation,
    endConversation,
    clearError,
  } = useAIChat({ cwd });

  const [showList, setShowList] = useState(!activeConversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages]);

  // Keyboard shortcut: Ctrl+Shift+N for new conversation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        newConversation();
        setShowList(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [newConversation]);

  const handleSend = useCallback((content: string) => {
    // If user wants to include current file as context, they can use @file syntax
    // For now just send the message directly
    sendMessage(content);
  }, [sendMessage]);

  const handleNewConversation = useCallback(() => {
    newConversation();
    setShowList(false);
  }, [newConversation]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversation(id);
    setShowList(false);
  }, [setActiveConversation]);

  const handleBack = useCallback(() => {
    setShowList(true);
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
  }, [deleteConversation]);

  const handleEndConversation = useCallback(() => {
    if (activeConversationId) {
      endConversation(activeConversationId);
    }
  }, [activeConversationId, endConversation]);

  const handleDeleteCurrent = useCallback(() => {
    if (activeConversationId) {
      deleteConversation(activeConversationId);
      setShowList(true);
    }
  }, [activeConversationId, deleteConversation]);

  // Calculate total usage for the conversation
  const totalUsage = activeConversation?.messages.reduce(
    (acc, msg) => {
      if (msg.usage) {
        const usage = msg.usage as { input_tokens?: number; output_tokens?: number };
        acc.inputTokens += usage.input_tokens || 0;
        acc.outputTokens += usage.output_tokens || 0;
      }
      if (msg.costUSD) {
        acc.costUSD += msg.costUSD;
      }
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, costUSD: 0 }
  );

  const scale = fontSize / 100;

  // Conversation list view
  if (showList) {
    return (
      <div className="h-full flex flex-col">
        <div
          className="flex items-center justify-between px-3 py-2 border-b shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            AI Chat
          </span>
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg-primary)',
              borderRadius: 'var(--radius)',
            }}
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <Bot size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
              <h3 className="text-base font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                Chat with Claude
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Start a conversation to ask questions about your code or get help with tasks.
              </p>
              {currentFile && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Working in: {cwd || 'current directory'}
                </p>
              )}
            </div>
          ) : (
            <div className="py-1">
              {conversations.map((conv) => (
                <ConversationRow
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onSelect={handleSelectConversation}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* Input always available - starts new conversation */}
        <ChatInput
          onSend={(content) => {
            handleNewConversation();
            // Small delay to let state update
            setTimeout(() => sendMessage(content), 0);
          }}
          isGenerating={isGenerating}
          placeholder="Start a new conversation..."
        />
      </div>
    );
  }

  // Active conversation view
  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-1 px-1.5 py-1 rounded text-sm hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          title="Back to conversations"
        >
          <ChevronLeft size={16} />
        </button>
        <span
          className="text-sm font-medium truncate flex-1"
          style={{ color: 'var(--text-primary)' }}
        >
          {activeConversation?.title || 'New conversation'}
        </span>

        {/* Token/cost usage display */}
        {totalUsage && (totalUsage.inputTokens > 0 || totalUsage.costUSD > 0) && (
          <span
            className="text-xs shrink-0 px-1.5 py-0.5 rounded"
            style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}
            title={`Input: ${totalUsage.inputTokens.toLocaleString()} tokens, Output: ${totalUsage.outputTokens.toLocaleString()} tokens`}
          >
            {totalUsage.costUSD > 0
              ? `$${totalUsage.costUSD.toFixed(4)}`
              : `${((totalUsage.inputTokens + totalUsage.outputTokens) / 1000).toFixed(1)}k`}
          </span>
        )}

        {isGenerating && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: 'var(--accent)' }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            </span>
            Thinking...
          </span>
        )}

        {/* End conversation button - only show if session exists */}
        {activeConversation?.claudeSessionId && !isGenerating && (
          <button
            onClick={handleEndConversation}
            className="p-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-secondary)' }}
            title="End conversation (clear session)"
          >
            <StopCircle size={16} />
          </button>
        )}

        {/* Delete conversation button */}
        <button
          onClick={handleDeleteCurrent}
          className="p-1 rounded hover:opacity-80 transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
          title="Delete conversation"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-3 py-2 text-sm flex items-center justify-between"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
        >
          <span className="truncate">{error}</span>
          <button onClick={clearError} className="text-xs underline shrink-0 ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        className="flex-1 min-h-0 overflow-auto py-4"
        ref={scrollContainerRef}
        style={scale !== 1 ? {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${100 / scale}%`,
        } : undefined}
      >
        {activeConversation?.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <Bot size={36} style={{ color: 'var(--text-secondary)', marginBottom: '12px' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Send a message to start chatting
            </p>
            {currentFile && (
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Context: {currentFile.split('/').pop()}
              </p>
            )}
          </div>
        )}

        {activeConversation?.messages.map((msg) => (
          <ChatMessageComponent key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onStop={stopGeneration}
        isGenerating={isGenerating}
        placeholder={currentFile ? `Ask about ${currentFile.split('/').pop()}...` : 'Send a message...'}
      />
    </div>
  );
}

// Sub-component for conversation list rows
function ConversationRow({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) {
  const messageCount = conversation.messages.length;
  const lastMessage = conversation.messages[messageCount - 1];
  const preview = lastMessage?.content?.slice(0, 80) || 'No messages';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conversation.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(conversation.id);
        }
      }}
      className="w-full px-3 py-2.5 text-left transition-colors flex items-start gap-2 group hover:bg-[var(--bg-primary)] cursor-pointer"
      style={{
        backgroundColor: isActive ? 'var(--bg-primary)' : undefined,
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {conversation.title}
          </span>
          <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(conversation.updatedAt)}
          </span>
        </div>
        <p
          className="text-xs truncate mt-0.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          {messageCount} message{messageCount !== 1 ? 's' : ''} · {preview}
        </p>
      </div>
      <button
        onClick={(e) => onDelete(e, conversation.id)}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 shrink-0 transition-opacity"
        style={{ color: 'var(--text-secondary)' }}
        title="Delete conversation"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}
