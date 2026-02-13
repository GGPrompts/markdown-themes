import { createContext, useContext, useCallback, type ReactNode } from 'react';

export interface TerminalContextValue {
  /** Send text to the active terminal tab. Returns true if sent, false if no terminal available. */
  sendToTerminal: (text: string) => boolean;
  /** Whether a terminal is currently open and has an active tab */
  hasActiveTerminal: boolean;
  /** Open the terminal panel (creates one if needed) */
  openTerminal: () => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

interface TerminalProviderProps {
  children: ReactNode;
  sendInput: (id: string, data: string) => void;
  activeTerminalTabId: string | null;
  openTerminal: () => void;
}

export function TerminalProvider({ children, sendInput, activeTerminalTabId, openTerminal }: TerminalProviderProps) {
  const sendToTerminal = useCallback((text: string): boolean => {
    if (!activeTerminalTabId) return false;
    sendInput(activeTerminalTabId, text);
    return true;
  }, [sendInput, activeTerminalTabId]);

  const hasActiveTerminal = activeTerminalTabId !== null;

  return (
    <TerminalContext.Provider value={{ sendToTerminal, hasActiveTerminal, openTerminal }}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminalContext(): TerminalContextValue | null {
  return useContext(TerminalContext);
}
