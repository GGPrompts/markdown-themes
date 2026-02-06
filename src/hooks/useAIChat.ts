import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

const API_BASE = 'http://localhost:8130';

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Per-model usage from Claude CLI result event (camelCase keys) */
export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  costUSD?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolUse?: ToolUseEvent[];
  usage?: TokenUsage;
  modelUsage?: ModelUsage;
  claudeSessionId?: string;
  costUSD?: number;
  durationMs?: number;
}

export interface ToolUseEvent {
  type: 'start' | 'end';
  name?: string;
  id?: string;
}

export interface ChatSettings {
  model?: string;
  addDirs?: string[];
  pluginDirs?: string[];
  appendSystemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
  permissionMode?: string;
  teammateMode?: string;
  agent?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  claudeSessionId?: string;
  createdAt: number;
  updatedAt: number;
  cwd?: string;
  settings?: ChatSettings;
}

interface UseAIChatOptions {
  cwd?: string | null;
}

export interface UseAIChatResult {
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
  updateConversationSettings: (id: string, settings: ChatSettings) => void;
  clearError: () => void;
}

const STORAGE_KEY = 'ai-chat-conversations';
const ACTIVE_CONV_KEY = 'ai-chat-active-conversation';
const SAVE_DEBOUNCE_MS = 2000;

function loadConversations(): Conversation[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateTitle(content: string): string {
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
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  // Keep a ref to conversations so sendMessage doesn't need it as a dependency
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  // Keep a ref to activeConversationId for the same reason
  const activeConvIdRef = useRef(activeConversationId);
  activeConvIdRef.current = activeConversationId;

  // Debounced localStorage persistence
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDirtyRef = useRef(false);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (saveDirtyRef.current) {
      saveDirtyRef.current = false;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationsRef.current));
      } catch (err) {
        console.warn('[useAIChat] Failed to save conversations:', err);
      }
    }
  }, []);

  // Schedule a debounced save whenever conversations change
  useEffect(() => {
    saveDirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [conversations, flushSave]);

  // Flush on unmount and on visibility change (tab switch / close)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) flushSave();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushSave();
    };
  }, [flushSave]);

  // Persist active conversation ID
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem(ACTIVE_CONV_KEY, activeConversationId);
    } else {
      localStorage.removeItem(ACTIVE_CONV_KEY);
    }
  }, [activeConversationId]);

  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const newConversation = useCallback(() => {
    const conv: Conversation = {
      id: generateId(),
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cwd: cwdRef.current ?? undefined,
    };
    setConversations(prev => [conv, ...prev]);
    setActiveConversationId(conv.id);
    return conv;
  }, []);

  const setActiveConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    setActiveConversationId(prevId => prevId === id ? null : prevId);
  }, []);

  const endConversation = useCallback(async (id: string) => {
    if (abortControllerRef.current && activeConvIdRef.current === id) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      inFlightRef.current = false;
    }

    try {
      await fetch(`${API_BASE}/api/chat/process?conversationId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('[useAIChat] Failed to kill backend process:', err);
    }

    setConversations(prev =>
      prev.map(c =>
        c.id === id ? { ...c, claudeSessionId: undefined } : c
      )
    );
  }, []);

  const updateConversationSettings = useCallback((id: string, settings: ChatSettings) => {
    setConversations(prev =>
      prev.map(c =>
        c.id === id ? { ...c, settings, updatedAt: Date.now() } : c
      )
    );
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    inFlightRef.current = false;
  }, []);

  // Helper to update a single message in a single conversation without O(n*m) full scan
  const updateMessage = useCallback((convId: string, msgId: string, updater: (msg: ChatMessage) => ChatMessage) => {
    setConversations(prev => {
      const convIdx = prev.findIndex(c => c.id === convId);
      if (convIdx === -1) return prev;
      const conv = prev[convIdx];
      const msgIdx = conv.messages.findIndex(m => m.id === msgId);
      if (msgIdx === -1) return prev;

      const newMsg = updater(conv.messages[msgIdx]);
      const newMessages = conv.messages.slice();
      newMessages[msgIdx] = newMsg;

      const newConvs = prev.slice();
      newConvs[convIdx] = { ...conv, messages: newMessages };
      return newConvs;
    });
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setError(null);
    setIsGenerating(true);

    // Read from refs to avoid stale closures
    let convId = activeConvIdRef.current;
    let conv = conversationsRef.current.find(c => c.id === convId);

    if (!conv) {
      const newConv: Conversation = {
        id: generateId(),
        title: generateTitle(content),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        cwd: cwdRef.current ?? undefined,
      };
      convId = newConv.id;
      conv = newConv;
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      toolUse: [],
    };

    const currentConvId = convId!;
    const assistantMsgId = assistantMessage.id;

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

    // Prepare messages for API
    const allMessages = [...(conv?.messages || []), userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }));

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Read settings from the latest conversation state
      const currentSettings = conversationsRef.current.find(c => c.id === currentConvId)?.settings ?? conv?.settings;

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          conversationId: currentConvId,
          claudeSessionId: conv?.claudeSessionId,
          cwd: cwdRef.current ?? undefined,
          ...(currentSettings?.model && { model: currentSettings.model }),
          ...(currentSettings?.addDirs?.length && { addDirs: currentSettings.addDirs }),
          ...(currentSettings?.pluginDirs?.length && { pluginDirs: currentSettings.pluginDirs }),
          ...(currentSettings?.appendSystemPrompt && { appendSystemPrompt: currentSettings.appendSystemPrompt }),
          ...(currentSettings?.allowedTools?.length && { allowedTools: currentSettings.allowedTools }),
          ...(currentSettings?.maxTurns && { maxTurns: currentSettings.maxTurns }),
          ...(currentSettings?.permissionMode && { permissionMode: currentSettings.permissionMode }),
          ...(currentSettings?.teammateMode && { teammateMode: currentSettings.teammateMode }),
          ...(currentSettings?.agent && { agent: currentSettings.agent }),
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

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case 'content': {
                updateMessage(currentConvId, assistantMsgId, m => ({
                  ...m,
                  content: m.content + event.content,
                }));
                break;
              }

              case 'tool_start': {
                const toolEvent: ToolUseEvent = {
                  type: 'start',
                  name: event.tool?.name,
                  id: event.tool?.id,
                };
                updateMessage(currentConvId, assistantMsgId, m => ({
                  ...m,
                  toolUse: [...(m.toolUse || []), toolEvent],
                }));
                break;
              }

              case 'tool_end': {
                updateMessage(currentConvId, assistantMsgId, m => ({
                  ...m,
                  toolUse: [...(m.toolUse || []), { type: 'end' as const }],
                }));
                break;
              }

              case 'done': {
                let modelUsage: Record<string, unknown> | undefined;
                if (event.modelUsage && typeof event.modelUsage === 'object') {
                  const values = Object.values(event.modelUsage as Record<string, unknown>);
                  if (values.length > 0) {
                    modelUsage = values[0] as Record<string, unknown>;
                  }
                }

                setConversations(prev => {
                  const convIdx = prev.findIndex(c => c.id === currentConvId);
                  if (convIdx === -1) return prev;
                  const c = prev[convIdx];
                  const msgIdx = c.messages.findIndex(m => m.id === assistantMsgId);
                  if (msgIdx === -1) return prev;

                  // Only set fields that are present -- backend may send
                  // multiple 'done' events (message_stop + result) and we
                  // must not overwrite good data with undefined
                  const newMsg = {
                    ...c.messages[msgIdx],
                    isStreaming: false,
                    ...(event.usage != null && { usage: event.usage }),
                    ...(modelUsage != null && { modelUsage: modelUsage as ChatMessage['modelUsage'] }),
                    ...(event.claudeSessionId && { claudeSessionId: event.claudeSessionId }),
                    ...(event.costUSD != null && { costUSD: event.costUSD }),
                    ...(event.durationMs != null && { durationMs: event.durationMs }),
                  };
                  const newMessages = c.messages.slice();
                  newMessages[msgIdx] = newMsg;

                  const newConvs = prev.slice();
                  newConvs[convIdx] = {
                    ...c,
                    claudeSessionId: event.claudeSessionId || c.claudeSessionId,
                    updatedAt: Date.now(),
                    messages: newMessages,
                  };
                  return newConvs;
                });

                // Flush save immediately on completion
                saveDirtyRef.current = true;
                flushSave();
                break;
              }

              case 'error': {
                setError(event.error || 'Unknown error from Claude');
                updateMessage(currentConvId, assistantMsgId, m => ({
                  ...m,
                  isStreaming: false,
                  content: m.content || '(Error occurred)',
                }));
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
        updateMessage(currentConvId, assistantMsgId, m => ({
          ...m,
          isStreaming: false,
          content: m.content || '(Cancelled)',
        }));
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMsg);
        updateMessage(currentConvId, assistantMsgId, m => ({
          ...m,
          isStreaming: false,
          content: m.content || `(Error: ${errorMsg})`,
        }));
      }
    } finally {
      setIsGenerating(false);
      inFlightRef.current = false;
      abortControllerRef.current = null;
      // Flush save when streaming ends
      saveDirtyRef.current = true;
      flushSave();
    }
  }, [updateMessage, flushSave]);

  return useMemo(() => ({
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
    updateConversationSettings,
    clearError,
  }), [
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
    updateConversationSettings,
    clearError,
  ]);
}
