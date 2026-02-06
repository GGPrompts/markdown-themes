import { createContext, useContext, type ReactNode } from 'react';
import { useAIChat, type Conversation, type ChatMessage, type ChatSettings, type UseAIChatResult } from '../hooks/useAIChat';
import { useWorkspaceContext } from './WorkspaceContext';

export type { Conversation, ChatMessage, ChatSettings };

const AIChatContext = createContext<UseAIChatResult | null>(null);

export function AIChatProvider({ children }: { children: ReactNode }) {
  const { workspacePath } = useWorkspaceContext();
  const chat = useAIChat({ cwd: workspacePath });

  return (
    <AIChatContext.Provider value={chat}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChatContext(): UseAIChatResult {
  const context = useContext(AIChatContext);
  if (!context) {
    throw new Error('useAIChatContext must be used within an AIChatProvider');
  }
  return context;
}
