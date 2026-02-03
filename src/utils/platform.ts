// Detect if running in Tauri or browser
export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

// Browser-based file picker using File System Access API (Chrome/Edge only)
export async function browserOpenFile(): Promise<{ path: string; content: string } | null> {
  try {
    // @ts-expect-error - File System Access API
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Markdown files',
          accept: { 'text/markdown': ['.md', '.markdown', '.txt'] },
        },
      ],
      multiple: false,
    });

    const file = await fileHandle.getFile();
    const content = await file.text();

    return {
      path: file.name,
      content,
    };
  } catch (err) {
    // User cancelled or API not supported
    if ((err as Error).name !== 'AbortError') {
      console.error('File picker error:', err);
    }
    return null;
  }
}

// Browser-based folder picker (limited support)
export async function browserOpenFolder(): Promise<string | null> {
  try {
    // @ts-expect-error - File System Access API
    const dirHandle = await window.showDirectoryPicker();
    return dirHandle.name;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Folder picker error:', err);
    }
    return null;
  }
}

// LocalStorage-based store for browser
const STORAGE_KEY = 'markdown-themes-settings';

export function browserStoreGet<T>(key: string): T | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return parsed[key] ?? null;
  } catch {
    return null;
  }
}

export function browserStoreSet<T>(key: string, value: T): void {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const parsed = data ? JSON.parse(data) : {};
    parsed[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

export function browserStoreDelete(key: string): void {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return;
    const parsed = JSON.parse(data);
    delete parsed[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (err) {
    console.error('Failed to delete from localStorage:', err);
  }
}
