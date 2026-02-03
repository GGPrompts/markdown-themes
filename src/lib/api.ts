/**
 * TabzChrome API Client
 *
 * Handles communication with the TabzChrome backend server.
 */

const API_BASE = 'http://localhost:8129';
const WS_URL = 'ws://localhost:8129/ws';

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
  });
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
