/**
 * Backend API Client
 *
 * Handles communication with the Go backend server.
 */

const API_BASE = 'http://localhost:8130';
const WS_URL = 'ws://localhost:8130/ws';

let authToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

/**
 * Fetch the auth token from the TabzChrome backend.
 * Caches the token for subsequent requests.
 */
export async function getAuthToken(): Promise<string> {
  if (authToken) {
    return authToken;
  }

  // Avoid multiple concurrent fetches
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = fetch(`${API_BASE}/api/auth/token`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch auth token: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      authToken = data.token;
      tokenPromise = null;
      return data.token;
    })
    .catch((err) => {
      tokenPromise = null;
      throw err;
    });

  return tokenPromise;
}

/**
 * Clear the cached auth token (e.g., after backend restart)
 */
export function clearAuthToken(): void {
  authToken = null;
  tokenPromise = null;
}

/**
 * Create a WebSocket connection to TabzChrome with authentication
 * TODO: Consider using WebSocket subprotocol for auth instead of URL query parameter
 */
export async function createWebSocket(): Promise<WebSocket> {
  const token = await getAuthToken();
  const ws = new WebSocket(`${WS_URL}?token=${token}`);
  return ws;
}

/**
 * File tree node from TabzChrome API
 */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  modified?: string;
  size?: number;
  isGitRepo?: boolean;
}

/**
 * Fetch file tree from TabzChrome
 */
export async function fetchFileTree(
  path: string,
  depth: number = 5,
  showHidden: boolean = false
): Promise<FileTreeNode> {
  const params = new URLSearchParams({
    path,
    depth: depth.toString(),
    showHidden: showHidden.toString(),
  });

  const response = await fetch(`${API_BASE}/api/files/tree?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch file tree: ${response.status}`);
  }

  return response.json();
}

/**
 * File content response from TabzChrome API
 */
export interface FileContent {
  path: string;
  content: string;
  fileName: string;
  fileSize: number;
  modified: string;
}

/**
 * Fetch file content from TabzChrome
 */
export async function fetchFileContent(path: string): Promise<FileContent> {
  const params = new URLSearchParams({ path });

  const response = await fetch(`${API_BASE}/api/files/content?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch file: ${response.status}`);
  }

  return response.json();
}

/**
 * Check if TabzChrome backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/token`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * WebSocket message types for file watching
 */
export interface FileWatchMessage {
  type: 'file-watch';
  path: string;
}

export interface FileUnwatchMessage {
  type: 'file-unwatch';
  path: string;
}

export interface FileContentMessage {
  type: 'file-content';
  path: string;
  content: string;
  modified: string;
  size: number;
}

export interface FileChangeMessage {
  type: 'file-change';
  path: string;
  content: string;
  modified: string;
  size: number;
  timestamp: number;
  timeSinceLastChange: number;
}

export interface FileDeletedMessage {
  type: 'file-deleted';
  path: string;
}

export interface FileWatchErrorMessage {
  type: 'file-watch-error';
  path?: string;
  error: string;
}

export type FileWatcherMessage =
  | FileContentMessage
  | FileChangeMessage
  | FileDeletedMessage
  | FileWatchErrorMessage;

/**
 * WebSocket message types for subagent monitoring
 */
export interface SubagentStartMessage {
  type: 'subagent-start';
  sessionId: string;
  workingDir: string;
  pane: string;
  parentSessionId?: string;
  taskDescription?: string;
}

export interface SubagentEndMessage {
  type: 'subagent-end';
  sessionId: string;
  pane: string;
  exitCode?: number;
}

export interface SubagentWatchMessage {
  type: 'subagent-watch';
  enabled: boolean;
}

export type SubagentMessage = SubagentStartMessage | SubagentEndMessage;

/**
 * Queue a command/prompt to the TabzChrome sidepanel chat input.
 * Creates a one-shot WebSocket connection to send the message.
 */
export async function queueToChat(command: string): Promise<void> {
  const ws = await createWebSocket();

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'QUEUE_COMMAND', command }));
      ws.close();
      resolve();
    };
    ws.onerror = (err) => {
      reject(err);
    };
    ws.onclose = (event) => {
      if (!event.wasClean) {
        reject(new Error(`WebSocket closed unexpectedly: ${event.code}`));
      }
    };
  });
}

/**
 * Paste content directly to the active terminal in TabzChrome sidepanel.
 * Creates a one-shot WebSocket connection to send the message.
 */
export async function pasteToTerminal(content: string): Promise<void> {
  const ws = await createWebSocket();

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'PASTE_COMMAND', command: content }));
      ws.close();
      resolve();
    };
    ws.onerror = (err) => {
      reject(err);
    };
    ws.onclose = (event) => {
      if (!event.wasClean) {
        reject(new Error(`WebSocket closed unexpectedly: ${event.code}`));
      }
    };
  });
}

// Current audio instance for read aloud - allows stopping playback
let currentAudio: HTMLAudioElement | null = null;

/**
 * Stop any currently playing read-aloud audio
 */
export function stopReadAloud(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/**
 * Read text aloud using TabzChrome's TTS system.
 * Uses edge-tts to generate audio and plays it locally in the browser.
 */
export async function readAloud(
  text: string,
  options?: {
    voice?: string;
    rate?: string;
    pitch?: string;
    volume?: number;
  }
): Promise<void> {
  // Validate text before sending
  if (!text || text.trim().length === 0) {
    throw new Error('No text content to read aloud');
  }

  // Stop any currently playing audio
  stopReadAloud();

  // Generate audio via TabzChrome API (60s timeout for long texts)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${API_BASE}/api/audio/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: options?.voice || 'en-US-AndrewNeural',
        rate: options?.rate || '+0%',
        pitch: options?.pitch || '+0Hz',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Failed to generate audio: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.url) {
      throw new Error(data.error || 'Failed to generate audio');
    }

    // Play audio locally
    const audio = new Audio(data.url);
    audio.volume = options?.volume ?? 0.7;
    currentAudio = audio;

    audio.onended = () => {
      currentAudio = null;
    };
    audio.onerror = () => {
      currentAudio = null;
    };

    await audio.play();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Audio generation timed out');
    }
    throw err;
  }
}

/**
 * Write content to a file via TabzChrome API
 */
export async function writeFile(path: string, content: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/files/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to write file: ${response.status}`);
  }
}

/**
 * Append a line to a file (creates file if it doesn't exist)
 */
export async function appendToFile(path: string, line: string): Promise<void> {
  let currentContent = '';

  try {
    const file = await fetchFileContent(path);
    currentContent = file.content;
  } catch {
    // File doesn't exist, start fresh
  }

  // Ensure content ends with newline, then append new line
  const newContent = currentContent.endsWith('\n') || currentContent === ''
    ? currentContent + line + '\n'
    : currentContent + '\n' + line + '\n';

  await writeFile(path, newContent);
}

/**
 * Git status types
 */
export type GitStatus = 'staged' | 'modified' | 'untracked';

export interface GitStatusInfo {
  status: GitStatus;
  indexStatus: string;
  workTreeStatus: string;
}

export interface GitStatusMap {
  [path: string]: GitStatusInfo;
}

export interface GitStatusResponse {
  isGitRepo: boolean;
  files: GitStatusMap;
}

/**
 * Fetch git status for files in a directory
 */
export async function fetchGitStatus(path: string): Promise<GitStatusResponse> {
  const params = new URLSearchParams({ path });
  const response = await fetch(`${API_BASE}/api/files/git-status?${params}`);

  if (!response.ok) {
    // Return empty state if endpoint fails (not a git repo, etc.)
    return { isGitRepo: false, files: {} };
  }

  return response.json();
}

/**
 * Archive a conversation file by copying it to a destination path
 * @param sourcePath - The original conversation file path
 * @param destPath - The destination archive path
 * @returns The full archived file path
 */
export async function archiveConversation(
  sourcePath: string,
  destPath: string
): Promise<string> {
  // First, read the source file content
  const fileContent = await fetchFileContent(sourcePath);

  // Generate the archived filename with timestamp
  const fileName = sourcePath.split('/').pop() || 'conversation.jsonl';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
  const archivedFileName = `${timestamp}_${fileName}`;
  const fullDestPath = destPath.endsWith('/')
    ? `${destPath}${archivedFileName}`
    : `${destPath}/${archivedFileName}`;

  // Write the content to the archive location
  await writeFile(fullDestPath, fileContent.content);

  return fullDestPath;
}

/**
 * Create a directory if it doesn't exist
 */
export async function ensureDirectory(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/files/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    // Ignore "already exists" errors
    if (!error.error?.includes('already exists') && !error.error?.includes('EEXIST')) {
      throw new Error(error.error || `Failed to create directory: ${response.status}`);
    }
  }
}

// ============================================================
// Conversation persistence API (SQLite backend)
// ============================================================

/**
 * Conversation list item returned by GET /api/chat/conversations
 */
export interface ConversationListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  cwd?: string;
  claudeSessionId?: string;
  settings?: Record<string, unknown>;
  messageCount: number;
  lastMessage?: string;
}

/**
 * Full conversation returned by GET /api/chat/conversations/:id
 */
export interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  cwd?: string;
  claudeSessionId?: string;
  settings?: Record<string, unknown>;
  messages: StoredMessage[];
}

/**
 * Message stored in the backend
 */
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolUse?: unknown[];
  usage?: Record<string, unknown>;
  modelUsage?: Record<string, unknown>;
  claudeSessionId?: string;
  costUSD?: number;
  durationMs?: number;
}

/**
 * List all conversations (lightweight, no full messages)
 */
export async function fetchConversations(): Promise<ConversationListItem[]> {
  const response = await fetch(`${API_BASE}/api/chat/conversations`);
  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.status}`);
  }
  return response.json();
}

/**
 * Get a full conversation with all messages
 */
export async function fetchConversation(id: string): Promise<StoredConversation> {
  const response = await fetch(`${API_BASE}/api/chat/conversations/${encodeURIComponent(id)}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Conversation not found');
    }
    throw new Error(`Failed to fetch conversation: ${response.status}`);
  }
  return response.json();
}

/**
 * Create a new conversation
 */
export async function createConversation(conv: StoredConversation): Promise<StoredConversation> {
  const response = await fetch(`${API_BASE}/api/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conv),
  });
  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status}`);
  }
  return response.json();
}

/**
 * Update an existing conversation
 */
export async function updateConversation(id: string, conv: StoredConversation): Promise<StoredConversation> {
  const response = await fetch(`${API_BASE}/api/chat/conversations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conv),
  });
  if (!response.ok) {
    throw new Error(`Failed to update conversation: ${response.status}`);
  }
  return response.json();
}

/**
 * Delete a conversation
 */
export async function deleteConversationAPI(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/chat/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete conversation: ${response.status}`);
  }
}
