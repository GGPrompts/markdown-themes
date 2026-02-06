import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { MessageSquarePlus, Trash2, ChevronLeft, Bot, StopCircle, X, RefreshCw, ExternalLink } from 'lucide-react';
import { ChatMessageComponent } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatSettings, getSettingsSummary } from './ChatSettings';
import { useAIChatContext, type Conversation } from '../../context/AIChatContext';
import { usePageState } from '../../context/PageStateContext';
import type { ModelUsage, ChatSettings as ChatSettingsType } from '../../hooks/useAIChat';

interface ChatPanelProps {
  /** Current file path for context */
  currentFile?: string | null;
  fontSize?: number;
  /** Callback to open the conversation JSONL in the main viewer. Receives the resolved file path, sessionId, and title. */
  onViewConversation?: (path: string, sessionId: string, title: string) => void;
}

const DEFAULT_CONTEXT_LIMIT = 200_000;

function getContextPercent(conversation: Conversation | null): number | null {
  if (!conversation) return null;
  // Find the latest assistant message with modelUsage data
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const msg = conversation.messages[i];
    if (msg.role === 'assistant' && msg.modelUsage) {
      const mu = msg.modelUsage as ModelUsage;
      const contextWindow = mu.contextWindow || DEFAULT_CONTEXT_LIMIT;
      // inputTokens is the non-cached portion; cache tokens are separate and additive
      const totalInput = (mu.inputTokens || 0)
        + (mu.cacheReadInputTokens || 0)
        + (mu.cacheCreationInputTokens || 0);
      const total = totalInput + (mu.outputTokens || 0);
      if (total === 0) continue;
      return Math.min(Math.round((total / contextWindow) * 100), 100);
    }
  }
  return null;
}

function getContextColor(percent: number): string {
  if (percent >= 90) return '#ef4444'; // red
  if (percent >= 70) return '#f97316'; // orange
  if (percent >= 50) return '#eab308'; // amber
  return 'var(--text-secondary)';      // default
}

function getConversationContextPercent(conversation: Conversation): number | null {
  return getContextPercent(conversation);
}

/** Check if a conversation is currently streaming */
function isConversationStreaming(conversation: Conversation): boolean {
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  return lastMsg?.isStreaming === true;
}

export function ChatPanel({ currentFile, fontSize = 100, onViewConversation }: ChatPanelProps) {
  const {
    conversations,
    activeConversation,
    activeConversationId,
    isGenerating,
    error,
    reconnectAttempt,
    backendLoaded,
    sendMessage,
    stopGeneration,
    newConversation,
    setActiveConversation,
    deleteConversation,
    endConversation,
    updateConversationSettings,
    clearError,
  } = useAIChatContext();

  const { filesState, setFilesState } = usePageState();

  // Chat tab state from PageStateContext
  const [chatTabs, setChatTabs] = useState<string[]>(filesState.chatTabs);
  const [activeChatTabId, setActiveChatTabId] = useState<string | null>(filesState.activeChatTabId);

  // Persist chat tab state changes
  useEffect(() => {
    setFilesState({ chatTabs, activeChatTabId });
  }, [chatTabs, activeChatTabId, setFilesState]);

  // Determine showList: show list when no active chat tab
  const showList = activeChatTabId === null;

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Keep activeConversation in sync with activeChatTabId
  useEffect(() => {
    if (activeChatTabId && activeChatTabId !== activeConversationId) {
      // Only set if the conversation still exists
      const exists = conversations.some(c => c.id === activeChatTabId);
      if (exists) {
        setActiveConversation(activeChatTabId);
      } else {
        // Conversation was deleted, remove the tab and switch to adjacent
        setChatTabs(prev => {
          const remaining = prev.filter(id => id !== activeChatTabId);
          setActiveChatTabId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
          return remaining;
        });
      }
    }
  }, [activeChatTabId, activeConversationId, conversations, setActiveConversation]);

  // Clean up tabs whose conversations have been deleted
  useEffect(() => {
    const convIds = new Set(conversations.map(c => c.id));
    setChatTabs(prev => {
      const filtered = prev.filter(id => convIds.has(id));
      if (filtered.length !== prev.length) {
        // If the active tab was removed, switch to the last remaining or null
        setActiveChatTabId(current => {
          if (current && !convIds.has(current)) {
            return filtered.length > 0 ? filtered[filtered.length - 1] : null;
          }
          return current;
        });
        return filtered;
      }
      return prev;
    });
  }, [conversations]);

  // Auto-scroll to bottom when new messages arrive
  // Uses scrollTop instead of scrollIntoView because CSS zoom breaks scrollIntoView coordinates
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [activeConversation?.messages]);

  const handleSend = useCallback((content: string) => {
    sendMessage(content);
  }, [sendMessage]);

  const handleNewConversation = useCallback(() => {
    const conv = newConversation();
    // Add the new conversation as a tab and activate it
    setChatTabs(prev => [...prev, conv.id]);
    setActiveChatTabId(conv.id);
  }, [newConversation]);

  // Keyboard shortcut: Ctrl+Shift+N for new conversation
  const handleNewConversationRef = useRef(handleNewConversation);
  handleNewConversationRef.current = handleNewConversation;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewConversationRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    // Open conversation as a tab
    setChatTabs(prev => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
    setActiveChatTabId(id);
    setActiveConversation(id);
  }, [setActiveConversation]);

  const handleBack = useCallback(() => {
    setActiveChatTabId(null);
  }, []);

  const handleTabClick = useCallback((id: string) => {
    setActiveChatTabId(id);
    setActiveConversation(id);
  }, [setActiveConversation]);

  const handleTabClose = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setChatTabs(prev => {
      const idx = prev.indexOf(id);
      const newTabs = prev.filter(tabId => tabId !== id);
      // If we're closing the active tab, switch to an adjacent one
      if (id === activeChatTabId) {
        if (newTabs.length === 0) {
          setActiveChatTabId(null);
        } else {
          const nextIdx = Math.min(idx, newTabs.length - 1);
          setActiveChatTabId(newTabs[nextIdx]);
          setActiveConversation(newTabs[nextIdx]);
        }
      }
      return newTabs;
    });
  }, [activeChatTabId, setActiveConversation]);

  const handleTabMiddleClick = useCallback((e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      handleTabClose(e, id);
    }
  }, [handleTabClose]);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Also remove from tabs
    setChatTabs(prev => prev.filter(tabId => tabId !== id));
    if (activeChatTabId === id) {
      setActiveChatTabId(null);
    }
    deleteConversation(id);
  }, [deleteConversation, activeChatTabId]);

  const handleEndConversation = useCallback(() => {
    if (activeConversationId) {
      endConversation(activeConversationId);
    }
  }, [activeConversationId, endConversation]);

  const handleDeleteCurrent = useCallback(() => {
    if (activeConversationId) {
      // Remove from tabs first
      setChatTabs(prev => {
        const newTabs = prev.filter(id => id !== activeConversationId);
        if (newTabs.length > 0) {
          setActiveChatTabId(newTabs[newTabs.length - 1]);
          setActiveConversation(newTabs[newTabs.length - 1]);
        } else {
          setActiveChatTabId(null);
        }
        return newTabs;
      });
      deleteConversation(activeConversationId);
    }
  }, [activeConversationId, deleteConversation, setActiveConversation]);

  const handleSettingsChange = useCallback((settings: ChatSettingsType) => {
    if (activeConversationId) {
      updateConversationSettings(activeConversationId, settings);
    }
  }, [activeConversationId, updateConversationSettings]);

  const contextPercent = backendLoaded ? getContextPercent(activeConversation) : null;

  const zoom = fontSize / 100;

  // Build a lookup of conversation data for tabs
  const conversationMap = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const conv of conversations) {
      map.set(conv.id, conv);
    }
    return map;
  }, [conversations]);

  // Tab bar component - shown when there are tabs
  const tabBar = chatTabs.length > 0 ? (
    <div
      className="flex items-center gap-0 overflow-x-auto shrink-0 border-b"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-primary)',
        scrollbarWidth: 'none',
      }}
    >
      {chatTabs.map(tabId => {
        const conv = conversationMap.get(tabId);
        if (!conv) return null;
        const isActive = tabId === activeChatTabId;
        const streaming = isConversationStreaming(conv);
        return (
          <div
            key={tabId}
            role="button"
            tabIndex={0}
            onClick={() => handleTabClick(tabId)}
            onMouseDown={(e) => handleTabMiddleClick(e, tabId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTabClick(tabId);
              }
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs cursor-pointer shrink-0 max-w-[160px] group relative"
            style={{
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--bg-secondary)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            }}
            title={conv.title}
          >
            {streaming && (
              <span
                className="inline-flex w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            )}
            <span className="truncate">
              {conv.title}
            </span>
            <button
              onClick={(e) => handleTabClose(e, tabId)}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 shrink-0 rounded transition-opacity"
              style={{ color: 'var(--text-secondary)' }}
              title="Close tab"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  ) : null;

  // Compute the 3 most recent tool segment IDs across all messages
  const recentToolIds = useMemo(() => {
    const messages = activeConversation?.messages;
    if (!messages) return new Set<string>();

    // Collect all tool segment IDs in order, across all messages
    const allToolIds: string[] = [];
    for (const msg of messages) {
      if (msg.segments) {
        for (const seg of msg.segments) {
          if (seg.type === 'tool') {
            allToolIds.push(seg.id);
          }
        }
      }
    }

    // Take the last 3
    const recent = allToolIds.slice(-3);
    return new Set(recent);
  }, [activeConversation?.messages]);

  // Conversation list view
  if (showList) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
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

        {/* Tab bar - shown even on list view so user can switch back to open tabs */}
        {tabBar}

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
                  Context: {currentFile.split('/').pop()}
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
                  isTabbed={chatTabs.includes(conv.id)}
                  backendLoaded={backendLoaded}
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
    <div className="h-full flex flex-col overflow-hidden">
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

        {/* Context usage display */}
        {contextPercent !== null && (
          <span
            className="text-xs shrink-0 px-1.5 py-0.5 rounded font-mono"
            style={{
              color: getContextColor(contextPercent),
              backgroundColor: 'var(--bg-primary)',
            }}
            title={`Context window: ${contextPercent}% of ${(DEFAULT_CONTEXT_LIMIT / 1000).toFixed(0)}k tokens`}
          >
            {contextPercent}%
          </span>
        )}

        {isGenerating && reconnectAttempt > 0 ? (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: '#f97316' }}>
            <RefreshCw size={12} className="animate-spin" />
            Reconnecting ({reconnectAttempt}/5)...
          </span>
        ) : isGenerating ? (
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
        ) : null}

        {/* View full conversation in main viewer */}
        {activeConversation?.claudeSessionId && onViewConversation && (
          <button
            onClick={async () => {
              const conv = activeConversation;
              if (!conv.claudeSessionId) return;
              try {
                const resp = await fetch(`http://localhost:8130/api/claude/session/${conv.claudeSessionId}`);
                if (!resp.ok) throw new Error('Session not found');
                const data = await resp.json();
                onViewConversation(data.conversationPath, conv.claudeSessionId, conv.title || 'Chat');
              } catch (err) {
                console.warn('[ViewConversation] Could not resolve session:', err);
              }
            }}
            className="p-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-secondary)' }}
            title="View full conversation in main viewer"
          >
            <ExternalLink size={16} />
          </button>
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

      {/* Tab bar */}
      {tabBar}

      {/* Settings bar */}
      <ChatSettings
        settings={activeConversation?.settings || {}}
        onSettingsChange={handleSettingsChange}
        disabled={isGenerating}
      />

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
        style={zoom !== 1 ? { zoom } : undefined}
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
          <ChatMessageComponent key={msg.id} message={msg} recentToolIds={recentToolIds} />
        ))}
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
  isTabbed,
  backendLoaded,
  onSelect,
  onDelete,
}: {
  conversation: Conversation;
  isActive: boolean;
  isTabbed: boolean;
  backendLoaded: boolean;
  onSelect: (id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) {
  const messageCount = conversation.messages.length;
  const lastMessage = conversation.messages[messageCount - 1];
  const preview = lastMessage?.content?.slice(0, 80) || 'No messages';
  const ctxPercent = backendLoaded ? getConversationContextPercent(conversation) : null;
  const settingsSummary = getSettingsSummary(conversation.settings);

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
          <span className="flex items-center gap-1.5">
            {isTabbed && (
              <span
                className="inline-flex w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--accent)', opacity: 0.6 }}
                title="Open in tab"
              />
            )}
            <span
              className="text-sm font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {conversation.title}
            </span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {ctxPercent !== null && (
              <span
                className="text-[10px] font-mono"
                style={{ color: getContextColor(ctxPercent) }}
              >
                {ctxPercent}%
              </span>
            )}
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {formatTime(conversation.updatedAt)}
            </span>
          </span>
        </div>
        <p
          className="text-xs truncate mt-0.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          {messageCount} message{messageCount !== 1 ? 's' : ''} · {preview}
        </p>
        {settingsSummary && (
          <span
            className="inline-block text-[10px] mt-0.5 px-1 py-0 rounded"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg-primary)',
              borderRadius: 'var(--radius)',
              opacity: 0.8,
            }}
          >
            {settingsSummary}
          </span>
        )}
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
