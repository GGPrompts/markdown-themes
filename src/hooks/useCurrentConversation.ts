import { useState, useCallback, useEffect } from 'react';

const API_BASE = 'http://localhost:8130';

// Common pane IDs to try when no pane is specified
// TabzChrome panes use tmux format %N, which gets sanitized to _N in state files
const DEFAULT_PANES = ['%1', '%2', '%3', '%4', '%5', '%6', '%7', '%8', '%9', '%10'];

export interface ConversationInfo {
  sessionId: string;
  workingDir: string;
  conversationPath: string;
  pane: string;
  status: string;
}

interface UseCurrentConversationResult {
  conversation: ConversationInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch Claude conversation info for a specific pane
 */
async function fetchConversationForPane(pane: string): Promise<ConversationInfo | null> {
  // Pane IDs like %0 must be URL-encoded (% -> %25)
  const response = await fetch(`${API_BASE}/api/claude/session?pane=${encodeURIComponent(pane)}`);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch conversation: ${response.status}`);
  }

  const data = await response.json();

  // Check if we got a valid session
  if (!data.sessionId || !data.conversationPath) {
    return null;
  }

  return data as ConversationInfo;
}

/**
 * Hook to fetch the current Claude conversation path from TabzChrome.
 *
 * @param pane - Optional tmux pane ID (e.g., "%3"). If not provided,
 *               checks URL params for ?pane=, then tries common panes.
 */
export function useCurrentConversation(pane?: string): UseCurrentConversationResult {
  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConversation = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Determine which pane to use
      let targetPane = pane;

      // Check URL params if no pane provided
      if (!targetPane) {
        const urlParams = new URLSearchParams(window.location.search);
        targetPane = urlParams.get('pane') || undefined;
      }

      if (targetPane) {
        // Try the specific pane
        const result = await fetchConversationForPane(targetPane);
        if (result) {
          setConversation(result);
          return;
        }
        setError(`No Claude session found in pane ${targetPane}`);
        setConversation(null);
        return;
      }

      // No pane specified, try common panes
      for (const tryPane of DEFAULT_PANES) {
        try {
          const result = await fetchConversationForPane(tryPane);
          if (result) {
            setConversation(result);
            return;
          }
        } catch {
          // Try next pane
          continue;
        }
      }

      // No session found in any pane
      setError('No Claude session found');
      setConversation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setConversation(null);
    } finally {
      setIsLoading(false);
    }
  }, [pane]);

  // Fetch on mount and when pane changes
  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  return {
    conversation,
    isLoading,
    error,
    refetch: fetchConversation,
  };
}
