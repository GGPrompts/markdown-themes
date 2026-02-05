import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = 'http://localhost:8130';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolUse?: ToolUseEvent[];
  usage?: Record<string, unknown>;
  claudeSessionId?: string;
  costUSD?: number;
  durationMs?: number;
}

export interface ToolUseEvent {
  type: 'start' | 'end';
  name?: string;
  id?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  claudeSessionId?: string;
  createdAt: number;
  updatedAt: number;
  cwd?: string;
}

interface UseAIChatOptions {
  cwd?: string | null;
}

interface UseAIChatResult {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  activeConversationId: string | null;
  isGenerating: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  newConversation: () => void;
  setActiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  endConversation: (id: string) => Promise<void>;
  clearError: () => void;
}

const STORAGE_KEY = 'ai-chat-conversations';
const ACTIVE_CONV_KEY = 'ai-chat-active-conversation';

function loadConversations(): Conversation[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateTitle(content: string): string {
  // Use first line, truncated to 50 chars
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
}

export function useAIChat(options: UseAIChatOptions = {}): UseAIChatResult {
  const { cwd } = options;

  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_CONV_KEY) || null;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  // Persist conversations when they change
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  // Persist active conversation ID
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem(ACTIVE_CONV_KEY, activeConversationId);
    } else {
      localStorage.removeItem(ACTIVE_CONV_KEY);
    }
  }, [activeConversationId]);

  const activeConversation = conversations.find(c => c.id === activeConversationId) ?? null;

  const newConversation = useCallback(() => {
    const conv: Conversation = {
      id: generateId(),
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cwd: cwd ?? undefined,
    };
    setConversations(prev => [conv, ...prev]);
    setActiveConversationId(conv.id);
    return conv;
  }, [cwd]);

  const setActiveConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    setActiveConversationId(prevId => prevId === id ? null : prevId);
  }, []);

  const endConversation = useCallback(async (id: string) => {
    // Stop any active generation first
    if (abortControllerRef.current && activeConversationId === id) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      inFlightRef.current = false;
    }

    // Kill the Claude process on the backend
    try {
      await fetch(`${API_BASE}/api/chat/process?conversationId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('[useAIChat] Failed to kill backend process:', err);
    }

    // Clear the claudeSessionId so next message starts a fresh session
    setConversations(prev =>
      prev.map(c =>
        c.id === id
          ? { ...c, claudeSessionId: undefined }
          : c
      )
    );
  }, [activeConversationId]);

  const clearError = useCallback(() => setError(null), []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    inFlightRef.current = false;
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setError(null);
    setIsGenerating(true);

    // Find or create conversation
    let convId = activeConversationId;
    let conv = conversations.find(c => c.id === convId);

    if (!conv) {
      const newConv: Conversation = {
        id: generateId(),
        title: generateTitle(content),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        cwd: cwd ?? undefined,
      };
      convId = newConv.id;
      conv = newConv;
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Create placeholder assistant message
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      toolUse: [],
    };

    const currentConvId = convId!;

    setConversations(prev =>
      prev.map(c =>
        c.id === currentConvId
          ? {
              ...c,
              title: c.messages.length === 0 ? generateTitle(content) : c.title,
              messages: [...c.messages, userMessage, assistantMessage],
              updatedAt: Date.now(),
            }
          : c
      )
    );

    // Prepare messages for API (all conversation history)
    const allMessages = [...(conv?.messages || []), userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }));

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          conversationId: currentConvId,
          claudeSessionId: conv?.claudeSessionId,
          cwd: cwd ?? undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Chat request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case 'content': {
                // Append text to assistant message
                setConversations(prev =>
                  prev.map(c =>
                    c.id === currentConvId
                      ? {
                          ...c,
                          messages: c.messages.map(m =>
                            m.id === assistantMessage.id
                              ? { ...m, content: m.content + event.content }
                              : m
                          ),
                        }
                      : c
                  )
                );
                break;
              }

              case 'tool_start': {
                const toolEvent: ToolUseEvent = {
                  type: 'start',
                  name: event.tool?.name,
                  id: event.tool?.id,
                };
                setConversations(prev =>
                  prev.map(c =>
                    c.id === currentConvId
                      ? {
                          ...c,
                          messages: c.messages.map(m =>
                            m.id === assistantMessage.id
                              ? { ...m, toolUse: [...(m.toolUse || []), toolEvent] }
                              : m
                          ),
                        }
                      : c
                  )
                );
                break;
              }

              case 'tool_end': {
                const toolEndEvent: ToolUseEvent = { type: 'end' };
                setConversations(prev =>
                  prev.map(c =>
                    c.id === currentConvId
                      ? {
                          ...c,
                          messages: c.messages.map(m =>
                            m.id === assistantMessage.id
                              ? { ...m, toolUse: [...(m.toolUse || []), toolEndEvent] }
                              : m
                          ),
                        }
                      : c
                  )
                );
                break;
              }

              case 'done': {
                setConversations(prev =>
                  prev.map(c =>
                    c.id === currentConvId
                      ? {
                          ...c,
                          claudeSessionId: event.claudeSessionId || c.claudeSessionId,
                          updatedAt: Date.now(),
                          messages: c.messages.map(m =>
                            m.id === assistantMessage.id
                              ? {
                                  ...m,
                                  isStreaming: false,
                                  usage: event.usage,
                                  claudeSessionId: event.claudeSessionId,
                                  costUSD: event.costUSD,
                                  durationMs: event.durationMs,
                                }
                              : m
                          ),
                        }
                      : c
                  )
                );
                break;
              }

              case 'error': {
                setError(event.error || 'Unknown error from Claude');
                setConversations(prev =>
                  prev.map(c =>
                    c.id === currentConvId
                      ? {
                          ...c,
                          messages: c.messages.map(m =>
                            m.id === assistantMessage.id
                              ? { ...m, isStreaming: false, content: m.content || '(Error occurred)' }
                              : m
                          ),
                        }
                      : c
                  )
                );
                break;
              }
            }
          } catch (parseErr) {
            console.warn('[useAIChat] Failed to parse SSE event:', jsonStr, parseErr);
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled - mark message as not streaming
        setConversations(prev =>
          prev.map(c =>
            c.id === currentConvId
              ? {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, isStreaming: false, content: m.content || '(Cancelled)' }
                      : m
                  ),
                }
              : c
          )
        );
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMsg);
        // Mark message as errored
        setConversations(prev =>
          prev.map(c =>
            c.id === currentConvId
              ? {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, isStreaming: false, content: m.content || `(Error: ${errorMsg})` }
                      : m
                  ),
                }
              : c
          )
        );
      }
    } finally {
      setIsGenerating(false);
      inFlightRef.current = false;
      abortControllerRef.current = null;
    }
  }, [activeConversationId, conversations, cwd]);

  return {
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
  };
}
