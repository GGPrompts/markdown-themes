import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ChevronLeft, GitCommit, FileDiff, Loader2, MessageCircle, Crosshair, Users, Columns, Bot } from 'lucide-react';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useWorkspaceStreaming } from '../hooks/useWorkspaceStreaming';
import { useDiffAutoScroll } from '../hooks/useDiffAutoScroll';
import { useCurrentConversation } from '../hooks/useCurrentConversation';
import { useSubagentWatcher, type ActiveSubagent } from '../hooks/useSubagentWatcher';
import { useWorkspaceContext } from '../context/WorkspaceContext';
import { usePageState } from '../context/PageStateContext';
import { useAppStore } from '../hooks/useAppStore';
import { useAIChatContext } from '../context/AIChatContext';
import { useTabManager } from '../hooks/useTabManager';
import { useSplitView } from '../hooks/useSplitView';
import { useRightPaneTabs } from '../hooks/useRightPaneTabs';
import { ViewerContainer } from '../components/ViewerContainer';
import { MetadataBar } from '../components/MetadataBar';
import { Sidebar } from '../components/Sidebar';
import { TabBar } from '../components/TabBar';
import { RightPaneTabBar } from '../components/RightPaneTabBar';
import { SplitView } from '../components/SplitView';
import { GitGraph, WorkingTree, MultiRepoView } from '../components/git';
import { DiffViewer } from '../components/viewers/DiffViewer';
import { ArchiveModal } from '../components/ArchiveModal';
import { ChatPanel } from '../components/chat';
import { parseFrontmatter } from '../utils/frontmatter';
import { themes } from '../themes';
import type { ArchivedConversation } from '../context/AppStoreContext';

const API_BASE = 'http://localhost:8130';

// Binary file types that have dedicated viewers fetching their own content
// Skip file watcher for these to avoid binary data leaking to markdown renderer
const BINARY_EXTENSIONS = new Set([
  // Audio
  'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm', 'wma', 'aiff', 'ape',
  // Video
  'mp4', 'ogv', 'mov', 'avi', 'mkv', 'm4v', 'wmv', 'flv',
  // Images (SVG excluded - it's text content that SvgViewer renders inline)
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'tif', 'avif',
  // Documents
  'pdf',
]);

// Extensions that are useful to follow during AI streaming mode
const FOLLOWABLE_EXTENSIONS = new Set([
  // Code
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'hpp', 'cs',
  'php', 'vue', 'svelte', 'astro',
  // Markup/docs
  'md', 'mdx', 'markdown', 'txt', 'rst',
  // Styles
  'css', 'scss', 'sass', 'less',
  // Config (but not lock files)
  'json', 'yaml', 'yml', 'toml', 'ini',
  'xml', 'html', 'htm',
  // Shell
  'sh', 'bash', 'zsh',
]);

/**
 * Check whether a file should be auto-opened in Follow mode.
 * Filters out noisy/internal files that aren't useful to watch.
 */
function shouldFollowFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // Skip internal/generated files
  if (
    filePath.includes('/.beads/') ||
    filePath.includes('/node_modules/') ||
    filePath.includes('/.git/') ||
    filePath.includes('/coverage/') ||
    filePath.includes('/.nyc_output/') ||
    filePath.includes('/dist/') ||
    filePath.includes('/build/') ||
    fileName.startsWith('.') ||
    fileName === 'package-lock.json' ||
    fileName === 'yarn.lock' ||
    fileName === 'pnpm-lock.yaml' ||
    fileName === 'composer.lock' ||
    ext === 'log' ||
    // Skip test result files
    fileName.includes('.test-result') ||
    fileName.includes('.junit') ||
    (ext === 'json' && (
      fileName.includes('test') ||
      fileName.includes('result') ||
      fileName.includes('report') ||
      fileName.includes('coverage')
    )) ||
    // Skip JSONL data files (often logs or large datasets)
    ext === 'jsonl' ||
    ext === 'ndjson'
  ) {
    return false;
  }

  return FOLLOWABLE_EXTENSIONS.has(ext);
}

/**
 * DiffPane - Fetches and displays a diff for a commit
 */
interface DiffPaneProps {
  repoPath: string;
  base: string;
  head?: string;
  file?: string;
  fontSize?: number;
  onBack?: () => void;
}

function DiffPane({ repoPath, base, head, file, fontSize = 100, onBack }: DiffPaneProps) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDiff() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ path: repoPath, base });
        if (head) params.set('head', head);
        if (file) params.set('file', file);

        const response = await fetch(`${API_BASE}/api/git/diff?${params}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Failed to fetch diff: ${response.status}`);
        }

        const data = await response.json();
        if (!cancelled) {
          setDiff(data.data?.diff || '');
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch diff');
          setLoading(false);
        }
      }
    }

    fetchDiff();

    return () => {
      cancelled = true;
    };
  }, [repoPath, base, head, file]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading diff...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FileDiff size={48} style={{ color: '#f87171', margin: '0 auto 16px' }} />
          <p style={{ color: '#f87171' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center" style={{ color: 'var(--text-secondary)' }}>
          <FileDiff size={48} style={{ margin: '0 auto 16px' }} />
          <p>No changes to display</p>
        </div>
      </div>
    );
  }

  const fileName = file?.split('/').pop() || 'Diff';

  return (
    <div className="h-full flex flex-col">
      {/* Header with back button */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            title="Back to Git Graph"
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>
        )}
        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {fileName}
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
          {base.substring(0, 7)}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <DiffViewer diff={diff} fontSize={fontSize} />
      </div>
    </div>
  );
}

/**
 * Derive home path from workspace path.
 * e.g., /home/matt/projects/something -> /home/matt
 */
function getHomePath(workspacePath: string | null): string {
  if (!workspacePath) return '/home';
  const match = workspacePath.match(/^(\/home\/[^/]+)/);
  return match ? match[1] : '/home';
}

export function Files() {
  // Get page state from context for persistence across navigation
  const { filesState, setFilesState } = usePageState();

  // Tab manager with initial state from context
  const handleTabStateChange = useCallback(
    (tabs: Parameters<typeof setFilesState>[0]['tabs'], activeTabId: string | null) => {
      setFilesState({ tabs, activeTabId });
    },
    [setFilesState]
  );

  const {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    openDiffTab,
    openConversationTab,
    closeConversationTab,
    pinTab,
    closeTab,
    setActiveTab,
  } = useTabManager({
    initialTabs: filesState.tabs,
    initialActiveTabId: filesState.activeTabId,
    onStateChange: handleTabStateChange,
  });

  // Current file is derived from the active tab
  const currentFile = activeTab?.path ?? null;

  const {
    state: appState,
    addRecentFile,
    saveFontSize,
    saveSidebarWidth,
    toggleFavorite,
    isFavorite,
    toggleFollowMode,
    saveArchiveLocation,
    addArchivedConversation,
  } = useAppStore();

  // Local state for sidebar width during drag (for smooth updates)
  const [sidebarWidth, setSidebarWidth] = useState(appState.sidebarWidth);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveFilePath, setArchiveFilePath] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const leftScrollContainerRef = useRef<HTMLDivElement>(null);
  const rightScrollContainerRef = useRef<HTMLDivElement>(null);

  // Counter incremented after git operations (commit, stage, etc.) to trigger Sidebar git status refresh
  const [gitStatusVersion, setGitStatusVersion] = useState(0);

  // Track recently closed files to prevent circular auto-reopening (path -> close timestamp)
  const recentlyClosedRef = useRef<Map<string, number>>(new Map());
  const RECENTLY_CLOSED_TTL = 5000; // 5 seconds

  // Track recently auto-opened files to prevent duplicate opens from race conditions
  // (e.g., both streamingFile and changedFiles effects triggering on the same file)
  const recentlyAutoOpenedRef = useRef<Map<string, number>>(new Map());

  // Check if a file was recently closed (within TTL)
  const wasRecentlyClosed = useCallback((path: string) => {
    const closedAt = recentlyClosedRef.current.get(path);
    if (!closedAt) return false;
    const isRecent = Date.now() - closedAt < RECENTLY_CLOSED_TTL;
    if (!isRecent) {
      recentlyClosedRef.current.delete(path);
    }
    return isRecent;
  }, []);

  // Check and mark file as auto-opened to prevent duplicate opens from race conditions
  // Returns true if the file should be opened, false if it was already opened recently
  const shouldAutoOpen = useCallback((filePath: string) => {
    const now = Date.now();
    const lastOpened = recentlyAutoOpenedRef.current.get(filePath);
    if (lastOpened && now - lastOpened < 500) {
      return false; // Already opened recently, skip
    }
    recentlyAutoOpenedRef.current.set(filePath, now);
    return true;
  }, []);

  // Wrap closeTab to track recently closed files
  const handleCloseTab = useCallback((id: string) => {
    // Find the tab being closed to get its path
    const tab = tabs.find(t => t.id === id);
    if (tab?.path) {
      recentlyClosedRef.current.set(tab.path, Date.now());
    }
    closeTab(id);
  }, [tabs, closeTab]);

  // Get workspace from global context
  const { workspacePath, fileTree, isGitRepo } = useWorkspaceContext();

  // Split view state with initial state from context
  const handleSplitStateChange = useCallback(
    (state: { isSplit: boolean; splitRatio: number; rightPaneContent: Parameters<typeof setFilesState>[0]['rightPaneContent'] }) => {
      setFilesState(state);
    },
    [setFilesState]
  );

  const {
    isSplit,
    splitRatio,
    rightPaneContent,
    rightFile,
    toggleSplit,
    openSplit,
    closeSplit,
    setSplitRatio,
    setRightFile,
    setRightPaneFile,
    setRightPaneGitGraph,
    setRightPaneWorkingTree,
  } = useSplitView({
    initialState: {
      isSplit: filesState.isSplit,
      splitRatio: filesState.splitRatio,
      rightPaneContent: filesState.rightPaneContent,
    },
    onStateChange: handleSplitStateChange,
  });

  // Right pane tabs state with persistence
  const handleRightPaneTabsStateChange = useCallback(
    (tabs: Parameters<typeof setFilesState>[0]['rightPaneTabs'], activeTabId: string | null) => {
      setFilesState({ rightPaneTabs: tabs, rightActiveTabId: activeTabId });
    },
    [setFilesState]
  );

  const {
    tabs: rightPaneTabs,
    activeTabId: rightActiveTabId,
    activeTab: rightActiveTab,
    openTab: openRightTab,
    pinTab: pinRightTab,
    closeTab: closeRightTabInternal,
    setActiveTab: setRightActiveTab,
  } = useRightPaneTabs({
    initialTabs: filesState.rightPaneTabs,
    initialActiveTabId: filesState.rightActiveTabId,
    onStateChange: handleRightPaneTabsStateChange,
  });

  // Wrap closeRightTab to track recently closed files (prevents circular auto-reopening)
  const closeRightTab = useCallback((id: string) => {
    const tab = rightPaneTabs.find(t => t.id === id);
    if (tab?.path) {
      recentlyClosedRef.current.set(tab.path, Date.now());
    }
    closeRightTabInternal(id);
  }, [rightPaneTabs, closeRightTabInternal]);

  // Close split view when all right pane tabs are closed
  // Follow mode will re-open split when needed (see line ~388)
  useEffect(() => {
    if (rightPaneTabs.length === 0 && rightPaneContent?.type === 'file' && isSplit) {
      setRightFile(null);
      closeSplit();
    }
  }, [rightPaneTabs.length, rightPaneContent?.type, isSplit, setRightFile, closeSplit]);

  // Chat panel state (third column, independent of split view)
  const [chatPanelOpen, setChatPanelOpen] = useState(filesState.chatPanelOpen);
  const [chatPanelWidth, setChatPanelWidth] = useState(filesState.chatPanelWidth);
  const chatResizeRef = useRef<HTMLDivElement>(null);

  // Persist chat panel state changes
  useEffect(() => {
    setFilesState({ chatPanelOpen, chatPanelWidth });
  }, [chatPanelOpen, chatPanelWidth, setFilesState]);

  // Toggle chat panel
  const toggleChatPanel = useCallback(() => {
    setChatPanelOpen((prev) => !prev);
  }, []);

  // AI Chat integration for "Send to Chat"
  const { sendToChat } = useAIChatContext();
  const handleSendToChat = useCallback((content: string) => {
    // Open chat panel if not already open
    setChatPanelOpen(true);
    sendToChat(content);
  }, [sendToChat]);

  // Handle chat panel resize
  const handleChatResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = chatPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Calculate new width (dragging left increases width, right decreases)
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(800, startWidth + deltaX));
      setChatPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [chatPanelWidth]);

  const currentFileExt = currentFile?.split('.').pop()?.toLowerCase();
  const isCurrentFileBinary = currentFileExt ? BINARY_EXTENSIONS.has(currentFileExt) : false;

  // Derive the actual right pane file path: use active tab if file mode, otherwise rightFile from split view
  const rightPaneFilePath = rightPaneContent?.type === 'file' && rightActiveTab
    ? rightActiveTab.path
    : rightFile;
  const rightFileExt = rightPaneFilePath?.split('.').pop()?.toLowerCase();
  const isRightFileBinary = rightFileExt ? BINARY_EXTENSIONS.has(rightFileExt) : false;

  // Current conversation detection for "View Conversation" button
  // Must be defined before file watchers to avoid watching the active conversation (causes freezes)
  const { conversation, isLoading: conversationLoading } = useCurrentConversation();

  // Check if a file is the current active conversation (being written to by Claude)
  // Watching this file causes freezes due to rapid updates and heavy JSONL parsing
  const isCurrentConversationFile = useCallback(
    (path: string | null) => path === conversation?.conversationPath,
    [conversation?.conversationPath]
  );

  // Track if we're viewing the active conversation (for streaming indicator logic)
  const isLeftPaneActiveConversation = isCurrentConversationFile(currentFile);

  // Use file watcher to get content and streaming state (left/main pane)
  // Skip for binary files - their viewers fetch their own data
  // Note: Active conversation is now watched with throttling in ConversationMarkdownViewer
  const {
    content,
    error,
    loading,
    isStreaming,
  } = useFileWatcher({
    path: isCurrentFileBinary ? null : currentFile,
  });

  // File watcher for right pane - subscribe whenever we have a file path.
  // Don't gate on isSplit: the watcher needs to be active before the split view renders
  // so content is ready immediately, and Follow mode can detect streaming.
  const rightWatcherPath = !isRightFileBinary ? rightPaneFilePath : null;
  const {
    content: rightContent,
    error: rightError,
    loading: rightLoading,
    isStreaming: rightIsStreaming,
  } = useFileWatcher({
    path: rightWatcherPath,
  });

  // Workspace streaming detection for follow mode and changed files tracking
  const { streamingFile, changedFiles, removeChangedFiles } = useWorkspaceStreaming({
    workspacePath,
    enabled: true, // Always enabled to track changed files for the Changed filter
  });

  // Subagent watching - auto-open conversation tabs when subagents start
  const handleSubagentStart = useCallback((subagent: ActiveSubagent) => {
    // Don't reopen if user recently closed this conversation
    if (wasRecentlyClosed(subagent.conversationPath)) {
      return;
    }
    // Open conversation tab in the left pane
    openConversationTab(subagent.conversationPath, {
      sessionId: subagent.sessionId,
      workingDir: subagent.workingDir,
      pane: subagent.pane,
      taskDescription: subagent.taskDescription,
      autoClose: false, // Don't auto-close by default
    });
  }, [openConversationTab, wasRecentlyClosed]);

  const handleSubagentEnd = useCallback((sessionId: string) => {
    // Optionally close the tab (respects autoClose setting)
    closeConversationTab(sessionId);
  }, [closeConversationTab]);

  const { count: activeSubagentCount } = useSubagentWatcher({
    enabled: appState.followStreamingMode,
    onSubagentStart: handleSubagentStart,
    onSubagentEnd: handleSubagentEnd,
  });

  // Auto-open streaming file when follow mode is enabled (opens in right pane)
  useEffect(() => {
    if (!appState.followStreamingMode || !streamingFile) return;

    // Auto-open if:
    // 1. Streaming file is different from current right pane file, OR
    // 2. Right pane matches but split view isn't open (persisted state from previous session)
    // Also skip if it's already open as a visible tab in the right pane
    const alreadyOpenAsTab = rightPaneTabs.some((t) => t.path === streamingFile);
    const alreadyVisible = isSplit && (streamingFile === rightPaneFilePath || alreadyOpenAsTab);
    if (!alreadyVisible) {
      // Filter out noisy files that aren't useful to watch
      if (!shouldFollowFile(streamingFile)) return;

      // Don't reopen files that were recently closed by the user
      if (wasRecentlyClosed(streamingFile)) return;

      // Deduplicate: skip if another effect already opened this file recently
      if (!shouldAutoOpen(streamingFile)) return;

      // Open streaming file in right pane tabs (enables split if needed)
      if (!isSplit) {
        openSplit();
      }
      // Use setRightPaneFile to ensure rightPaneContent is set to file mode
      setRightPaneFile(streamingFile);
      // Open as a tab with addNew so it adds new tabs instead of replacing
      openRightTab(streamingFile, { preview: true, addNew: true });
      addRecentFile(streamingFile);
    }
  }, [appState.followStreamingMode, streamingFile, rightPaneFilePath, rightPaneTabs, isSplit, openSplit, setRightPaneFile, openRightTab, addRecentFile, wasRecentlyClosed, shouldAutoOpen]);

  // Track files that have been auto-opened as tabs (to avoid re-opening)
  const autoOpenedFilesRef = useRef<Set<string>>(new Set());

  // Clear auto-opened tracking when workspace changes (prevents stale paths from old workspace)
  useEffect(() => {
    autoOpenedFilesRef.current.clear();
  }, [workspacePath]);

  // Auto-open changed files as tabs in the RIGHT pane when Follow mode is active
  useEffect(() => {
    if (!appState.followStreamingMode) return;

    // Find new changed files that haven't been auto-opened yet
    const newChangedFiles: string[] = [];
    changedFiles.forEach((filePath) => {
      if (autoOpenedFilesRef.current.has(filePath)) return;

      // Check if file is already open as a tab in the right pane
      const existingTab = rightPaneTabs.find((t) => t.path === filePath);
      if (existingTab) return;

      // Apply the shared file filtering logic
      if (!shouldFollowFile(filePath)) return;

      newChangedFiles.push(filePath);
    });

    if (newChangedFiles.length === 0) return;

    // Auto-enable split view when there are new changed files to open
    if (!isSplit) {
      openSplit();
    }

    // Open new tabs in the right pane as preview tabs
    newChangedFiles.forEach((filePath) => {
      // Deduplicate: skip if another effect already opened this file recently
      if (!shouldAutoOpen(filePath)) {
        return;
      }
      autoOpenedFilesRef.current.add(filePath);
      openRightTab(filePath, true); // preview mode
    });
  }, [appState.followStreamingMode, isSplit, changedFiles, rightPaneTabs, openRightTab, shouldAutoOpen, openSplit]);

  // Handle commit success - close tabs for committed files (review queue cleanup)
  // Right pane tabs act as a review queue; committed files are "done" and removed
  const handleCommitSuccess = useCallback((committedFiles: string[]) => {
    const committedSet = new Set(committedFiles);

    // Find and close ALL tabs in the right pane for committed files (preview or pinned)
    const tabsToClose = rightPaneTabs.filter((t) => committedSet.has(t.path));
    tabsToClose.forEach((t) => closeRightTab(t.id));

    // Remove from auto-opened tracking ref
    committedFiles.forEach((f) => autoOpenedFilesRef.current.delete(f));

    // Remove committed files from the changedFiles set so the "Changed" sidebar filter updates
    removeChangedFiles(committedFiles);

    // Bump git status version so Sidebar re-fetches git status
    setGitStatusVersion((v) => v + 1);
  }, [rightPaneTabs, closeRightTab, removeChangedFiles]);

  const themeClass = themes.find((t) => t.id === appState.theme)?.className ?? '';

  // Check if current file is markdown
  const isMarkdownFile = useMemo(() => {
    if (!currentFile) return false;
    const ext = currentFile.split('.').pop()?.toLowerCase();
    return ext === 'md' || ext === 'markdown' || ext === 'mdx';
  }, [currentFile]);

  // Parse frontmatter from content (only for markdown files)
  const { frontmatter, content: markdownContent } = useMemo(
    () => (isMarkdownFile ? parseFrontmatter(content) : { frontmatter: null, content }),
    [content, isMarkdownFile]
  );

  // Check if right file is markdown
  const isRightMarkdownFile = useMemo(() => {
    if (!rightPaneFilePath) return false;
    const ext = rightPaneFilePath.split('.').pop()?.toLowerCase();
    return ext === 'md' || ext === 'markdown' || ext === 'mdx';
  }, [rightPaneFilePath]);

  // Parse frontmatter from right content (only for markdown files)
  const { frontmatter: rightFrontmatter, content: rightMarkdownContent } = useMemo(
    () => (isRightMarkdownFile ? parseFrontmatter(rightContent) : { frontmatter: null, content: rightContent }),
    [rightContent, isRightMarkdownFile]
  );

  // Auto-scroll to changes during actual streaming (rapid file changes < 1.5s)
  // Uses block-level diffing for markdown, line-level for code files
  useDiffAutoScroll({
    content: isMarkdownFile ? markdownContent : content,
    isStreaming,
    scrollContainerRef: leftScrollContainerRef,
    filePath: currentFile ?? undefined,
    enabled: isStreaming && !isLeftPaneActiveConversation, // Disable auto-scroll for active conversation (handled by viewer)
  });

  // Auto-scroll for right pane (used by Follow AI Edits)
  // Only scroll when content is actually changing (rightIsStreaming).
  // Follow mode controls auto-OPENING files, not auto-scrolling.
  // Auto-scroll is driven by actual content changes detected via diffing.
  useDiffAutoScroll({
    content: isRightMarkdownFile ? rightMarkdownContent : rightContent,
    isStreaming: rightIsStreaming,
    scrollContainerRef: rightScrollContainerRef,
    filePath: rightPaneFilePath ?? undefined,
    enabled: rightIsStreaming,
  });

  // Get recent files for empty state (limit to 6)
  const recentFilesForEmptyState = useMemo(() => {
    return appState.recentFiles.slice(0, 6);
  }, [appState.recentFiles]);

  // Handle font size change with persistence
  const handleFontSizeChange = useCallback(
    (size: number) => {
      saveFontSize(size);
    },
    [saveFontSize]
  );

  // Handle file selection (single-click = preview)
  const handleFileSelect = useCallback(
    (path: string) => {
      openTab(path, true); // preview mode
      addRecentFile(path);
    },
    [openTab, addRecentFile]
  );

  // Handle file double-click (pin the tab)
  const handleFileDoubleClick = useCallback(
    (path: string) => {
      openTab(path, false); // pinned mode
      addRecentFile(path);
    },
    [openTab, addRecentFile]
  );

  // Handle file selection for right pane (in split view mode)
  const handleRightFileSelect = useCallback(
    (path: string) => {
      // Ensure right pane is in file mode and open as tab
      setRightPaneFile(path);
      openRightTab(path, true); // preview mode
      addRecentFile(path);
    },
    [setRightPaneFile, openRightTab, addRecentFile]
  );

  // Handle drop to right pane (drag-and-drop from tabs)
  const handleDropToRight = useCallback(
    (path: string, fromPane: 'left' | 'right' | null) => {
      // Don't do anything if dropping the same file or from right pane
      if (path === rightPaneFilePath || fromPane === 'right') return;
      // Don't allow dropping the current conversation - it's actively being written to
      if (path === conversation?.conversationPath) return;
      // If dragging from left pane, close the left tab (transfer, not duplicate)
      if (fromPane === 'left') {
        const leftTab = tabs.find((t) => t.path === path);
        if (leftTab) {
          handleCloseTab(leftTab.id);
        }
      }
      // Ensure right pane is in file mode and open as pinned tab
      setRightPaneFile(path);
      openRightTab(path, false); // pinned mode (dragging = intentional)
      addRecentFile(path);
    },
    [rightPaneFilePath, conversation?.conversationPath, tabs, handleCloseTab, setRightPaneFile, openRightTab, addRecentFile]
  );

  // Handle drop to left pane (drag-and-drop from right pane tabs)
  const handleDropToLeft = useCallback(
    (path: string, fromPane: 'left' | 'right' | null) => {
      // Don't do anything if dropping from left pane
      if (fromPane === 'left') return;
      // If dragging from right pane, close the right tab (transfer, not duplicate)
      if (fromPane === 'right') {
        const rightTab = rightPaneTabs.find((t) => t.path === path);
        if (rightTab) {
          closeRightTab(rightTab.id);
        }
      }
      // Open as pinned tab in left pane
      openTab(path, false);
      addRecentFile(path);
    },
    [rightPaneTabs, closeRightTab, openTab, addRecentFile]
  );

  // Handle closing the right pane file (close all tabs)
  const handleCloseRight = useCallback(() => {
    setRightFile(null);
  }, [setRightFile]);

  // Handle sidebar width change during drag (real-time updates)
  const handleSidebarWidthChange = useCallback((width: number) => {
    setSidebarWidth(width);
  }, []);

  // Handle sidebar width change end (persist to localStorage)
  const handleSidebarWidthChangeEnd = useCallback((width: number) => {
    saveSidebarWidth(width);
  }, [saveSidebarWidth]);

  // Handle git graph toggle
  const handleGitGraphToggle = useCallback(() => {
    // If git graph is already shown, close the split view
    if (rightPaneContent?.type === 'git-graph') {
      setRightFile(null);
    } else {
      // Open split view with git graph
      if (!isSplit) {
        openSplit();
      }
      setRightPaneGitGraph();
    }
  }, [rightPaneContent, isSplit, openSplit, setRightFile, setRightPaneGitGraph]);

  // Handle working tree toggle
  const handleWorkingTreeToggle = useCallback(() => {
    // If working tree is already shown, close the split view
    if (rightPaneContent?.type === 'working-tree') {
      setRightFile(null);
    } else {
      // Open split view with working tree
      if (!isSplit) {
        openSplit();
      }
      setRightPaneWorkingTree();
    }
  }, [rightPaneContent, isSplit, openSplit, setRightFile, setRightPaneWorkingTree]);

  // Handle chat panel toggle (now a separate third column)
  const handleChatPanelToggle = useCallback(() => {
    toggleChatPanel();
  }, [toggleChatPanel]);

  // Handle hotkeys button - open HOTKEYS.md in right pane
  const handleHotkeysClick = useCallback(async () => {
    if (!workspacePath) return;
    const hotkeysPath = workspacePath + '/HOTKEYS.md';

    // Verify file exists before opening (avoids confusing error state)
    try {
      const response = await fetch(`${API_BASE}/api/files/content?path=${encodeURIComponent(hotkeysPath)}`);
      if (!response.ok) {
        console.warn(`HOTKEYS.md not found at ${hotkeysPath}`);
        return;
      }
    } catch (err) {
      console.warn('Failed to check HOTKEYS.md existence:', err);
      return;
    }

    if (!isSplit) {
      openSplit();
    }
    setRightPaneFile(hotkeysPath);
    openRightTab(hotkeysPath, false); // Open as pinned tab
  }, [workspacePath, isSplit, openSplit, setRightPaneFile, openRightTab]);

  // Handle view conversation button - open conversation JSONL file
  const handleViewConversation = useCallback(() => {
    if (!conversation?.conversationPath) {
      console.warn('[handleViewConversation] No conversation path available');
      return;
    }

    // Open as a conversation tab with a descriptive name instead of the raw session ID
    openConversationTab(conversation.conversationPath, {
      sessionId: conversation.sessionId,
      workingDir: conversation.workingDir,
      pane: conversation.pane || '',
      taskDescription: 'Current Session',
      autoClose: false,
    });
    addRecentFile(conversation.conversationPath);
  }, [conversation, openConversationTab, addRecentFile]);

  // Handle archive from sidebar context menu or other triggers
  const handleArchiveFile = useCallback((path: string) => {
    setArchiveFilePath(path);
    setShowArchiveModal(true);
  }, []);

  // Handle archive completion
  const handleArchiveComplete = useCallback((archive: ArchivedConversation) => {
    addArchivedConversation(archive);
  }, [addArchivedConversation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // / - Focus search
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Ctrl/Cmd + B - Toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarVisible((prev) => !prev);
        return;
      }

      // Ctrl/Cmd + \ - Toggle split view
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleSplit();
        return;
      }

      // Ctrl/Cmd + G - Toggle git graph
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'g') {
        e.preventDefault();
        handleGitGraphToggle();
        return;
      }

      // Ctrl/Cmd + Shift + G - Toggle working tree
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        handleWorkingTreeToggle();
        return;
      }

      // Ctrl/Cmd + Shift + C - Toggle AI chat panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        handleChatPanelToggle();
        return;
      }

      // ? - Show keyboard shortcuts
      if (e.key === '?') {
        e.preventDefault();
        handleHotkeysClick();
        return;
      }

      // Escape - Clear focus / close split
      if (e.key === 'Escape') {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSplit, handleGitGraphToggle, handleWorkingTreeToggle, handleChatPanelToggle, handleHotkeysClick]);

  // Portal target for nav actions
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById('nav-actions-slot'));
  }, []);

  return (
    <>
      {/* Portal actions into NavHeader's #nav-actions-slot */}
      {portalTarget && createPortal(
        <>
          {/* View Conversation */}
          <button
            type="button"
            onClick={handleViewConversation}
            disabled={!conversation?.conversationPath || conversationLoading}
            className="w-8 h-8 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title={conversationLoading ? 'Loading conversation...' : conversation?.conversationPath ? 'View current conversation' : 'No conversation found'}
          >
            {conversationLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4" />
            )}
          </button>

          {/* Separator */}
          <div className="w-px h-5" style={{ backgroundColor: 'var(--border)' }} />

          {/* Follow AI Edits toggle */}
          <button
            type="button"
            onClick={toggleFollowMode}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: appState.followStreamingMode ? 'var(--accent)' : 'var(--bg-primary)',
              color: appState.followStreamingMode ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title={appState.followStreamingMode ? 'Stop following AI edits' : 'Follow AI edits (auto-open streaming files)'}
          >
            <Crosshair className="w-4 h-4" />
          </button>

          {/* Active subagents indicator */}
          {appState.followStreamingMode && activeSubagentCount > 0 && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                borderRadius: 'var(--radius)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
              title={`${activeSubagentCount} active subagent${activeSubagentCount > 1 ? 's' : ''}`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{activeSubagentCount}</span>
            </div>
          )}

          {/* Split View toggle */}
          <button
            type="button"
            onClick={toggleSplit}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: isSplit ? 'var(--accent)' : 'var(--bg-primary)',
              color: isSplit ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title={isSplit ? 'Close split view' : 'Open split view'}
          >
            <Columns className="w-4 h-4" />
          </button>

          {/* Font size controls */}
          <div className="flex items-center gap-0">
            <button
              type="button"
              onClick={() => handleFontSizeChange(Math.max(50, appState.fontSize - 10))}
              className="w-7 h-7 flex items-center justify-center text-sm font-medium transition-colors"
              style={{
                borderRadius: 'var(--radius) 0 0 var(--radius)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              title="Decrease font size"
            >
              -
            </button>
            <span
              className="w-12 h-7 flex items-center justify-center text-xs"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {appState.fontSize}%
            </span>
            <button
              type="button"
              onClick={() => handleFontSizeChange(Math.min(200, appState.fontSize + 10))}
              className="w-7 h-7 flex items-center justify-center text-sm font-medium transition-colors"
              style={{
                borderRadius: '0 var(--radius) var(--radius) 0',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              title="Increase font size"
            >
              +
            </button>
          </div>

          {/* AI Chat panel toggle */}
          <button
            type="button"
            onClick={handleChatPanelToggle}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              borderRadius: 'var(--radius)',
              backgroundColor: chatPanelOpen ? 'var(--accent)' : 'var(--bg-primary)',
              color: chatPanelOpen ? 'var(--bg-primary)' : 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title={chatPanelOpen ? 'Close AI chat panel (Ctrl+Shift+C)' : 'Open AI chat panel (Ctrl+Shift+C)'}
          >
            <Bot className="w-4 h-4" />
          </button>
        </>,
        portalTarget
      )}

      <div className="flex-1 flex overflow-hidden">
        {workspacePath && sidebarVisible && (
          <Sidebar
            fileTree={fileTree}
            currentFile={currentFile}
            workspacePath={workspacePath}
            homePath={getHomePath(workspacePath)}
            isSplit={isSplit}
            width={sidebarWidth}
            onWidthChange={handleSidebarWidthChange}
            onWidthChangeEnd={handleSidebarWidthChangeEnd}
            onFileSelect={handleFileSelect}
            onFileDoubleClick={handleFileDoubleClick}
            onRightFileSelect={handleRightFileSelect}
            favorites={appState.favorites}
            toggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
            searchInputRef={searchInputRef}
            changedFiles={changedFiles}
            gitStatusVersion={gitStatusVersion}
            onSendToChat={handleSendToChat}
            onArchiveFile={handleArchiveFile}
          />
        )}

        <SplitView
          isSplit={isSplit}
          splitRatio={splitRatio}
          onSplitRatioChange={setSplitRatio}
          onDropToRight={handleDropToRight}
          onDropToLeft={handleDropToLeft}
          rightPaneContent={rightPaneContent}
          onCloseRight={handleCloseRight}
          rightIsStreaming={rightIsStreaming}
          isGitGraph={rightPaneContent?.type === 'git-graph'}
          isWorkingTree={rightPaneContent?.type === 'working-tree'}
          onGitGraphToggle={handleGitGraphToggle}
          onWorkingTreeToggle={handleWorkingTreeToggle}
          onHotkeysClick={handleHotkeysClick}
          rightPaneTabBar={
            <RightPaneTabBar
              tabs={rightPaneTabs}
              activeTabId={rightActiveTabId}
              onTabSelect={setRightActiveTab}
              onTabClose={closeRightTab}
              onTabPin={pinRightTab}
            />
          }
          leftPane={
            <div className="flex-1 flex flex-col overflow-hidden">
              <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onTabSelect={setActiveTab}
                onTabClose={handleCloseTab}
                onTabPin={pinTab}
                streamingFilePath={streamingFile}
              />

              {(activeTab?.type === 'file' || activeTab?.type === 'conversation') && loading && (
                <div className="flex items-center justify-center h-full">
                  <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                </div>
              )}

              {(activeTab?.type === 'file' || activeTab?.type === 'conversation') && error && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-red-500 mb-2">{error}</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Make sure the backend is running on port 8130
                    </p>
                  </div>
                </div>
              )}

              {(!activeTab || activeTab?.type === 'file' || activeTab?.type === 'conversation') && !loading && !error && !currentFile && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    {recentFilesForEmptyState.length > 0 ? (
                      <>
                        <div className="flex items-center justify-center gap-2 mb-4">
                          <Clock size={18} style={{ color: 'var(--text-secondary)' }} />
                          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                            Recent Files
                          </h2>
                        </div>
                        <div className="space-y-1">
                          {recentFilesForEmptyState.map((path) => (
                            <button
                              key={path}
                              type="button"
                              onClick={() => handleFileSelect(path)}
                              className="w-full text-left px-3 py-2 text-sm transition-colors hover:opacity-80"
                              style={{
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius)',
                                color: 'var(--text-primary)',
                              }}
                            >
                              <span style={{ color: 'var(--accent)' }}>
                                {path.split('/').pop()}
                              </span>
                              <span
                                className="block text-xs truncate mt-0.5"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {path}
                              </span>
                            </button>
                          ))}
                        </div>
                        <p className="text-xs mt-4" style={{ color: 'var(--text-secondary)' }}>
                          Or select a file from the sidebar
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <ChevronLeft size={20} style={{ color: 'var(--text-secondary)' }} />
                          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                            Select a file from the sidebar
                          </h2>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Browse and open markdown files to view them with beautiful themes
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Diff tab content */}
              {activeTab?.type === 'diff' && activeTab.diffData && workspacePath && (
                <DiffPane
                  repoPath={workspacePath}
                  base={activeTab.diffData.base}
                  head={activeTab.diffData.head}
                  file={activeTab.diffData.file}
                  fontSize={appState.fontSize}
                />
              )}

              {/* File and Conversation tab content */}
              {(activeTab?.type === 'file' || activeTab?.type === 'conversation') && !loading && !error && currentFile && (content || isCurrentFileBinary) && (
                <>
                  {isMarkdownFile && frontmatter && <MetadataBar frontmatter={frontmatter} />}
                  <div className="flex-1 overflow-auto" ref={leftScrollContainerRef}>
                    <ViewerContainer
                      filePath={currentFile}
                      content={markdownContent}
                      isStreaming={isStreaming}
                      themeClassName={themeClass}
                      fontSize={appState.fontSize}
                      repoPath={workspacePath}
                      onSendToChat={handleSendToChat}
                      scrollContainerRef={leftScrollContainerRef}
                    />
                  </div>
                </>
              )}
            </div>
          }
          rightPane={
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Empty state - no content selected */}
              {!rightPaneContent && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Drag a tab here to view in split pane
                    </p>
                  </div>
                </div>
              )}

              {/* File content type */}
              {rightPaneContent?.type === 'file' && (
                <>
                  {rightLoading && (
                    <div className="flex items-center justify-center h-full">
                      <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                    </div>
                  )}

                  {rightError && (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <p className="text-red-500 mb-2">{rightError}</p>
                      </div>
                    </div>
                  )}

                  {!rightLoading && !rightError && rightPaneFilePath && (
                    <>
                      {isRightMarkdownFile && rightFrontmatter && <MetadataBar frontmatter={rightFrontmatter} />}
                      <div className="flex-1 overflow-auto" ref={rightScrollContainerRef}>
                        <ViewerContainer
                          filePath={rightPaneFilePath}
                          content={rightMarkdownContent}
                          isStreaming={rightIsStreaming}
                          themeClassName={themeClass}
                          fontSize={appState.fontSize}
                          repoPath={workspacePath}
                          onSendToChat={handleSendToChat}
                          scrollContainerRef={rightScrollContainerRef}
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Git graph content type */}
              {rightPaneContent?.type === 'git-graph' && workspacePath && (
                <GitGraph
                  repoPath={workspacePath}
                  onCommitSelect={(hash) => console.log('Selected commit:', hash)}
                  onFileClick={(commitHash, filePath) => {
                    // Open diff in left pane as a tab instead of replacing the git graph
                    openDiffTab(commitHash, filePath);
                  }}
                  fontSize={appState.fontSize}
                />
              )}

              {/* Working tree content type */}
              {rightPaneContent?.type === 'working-tree' && workspacePath && (
                isGitRepo ? (
                  <WorkingTree
                    repoPath={workspacePath}
                    fontSize={appState.fontSize}
                    onFileSelect={(path) => {
                      // Open the file in the left pane
                      handleFileSelect(path);
                    }}
                    onCommitSuccess={handleCommitSuccess}
                  />
                ) : (
                  <MultiRepoView
                    projectsDir={workspacePath}
                    fontSize={appState.fontSize}
                    onFileSelect={(path) => {
                      // Open the file in the left pane
                      handleFileSelect(path);
                    }}
                  />
                )
              )}

              {/* Diff content type */}
              {rightPaneContent?.type === 'diff' && workspacePath && (
                <DiffPane
                  repoPath={workspacePath}
                  base={rightPaneContent.base}
                  head={rightPaneContent.head}
                  file={rightPaneContent.file}
                  fontSize={appState.fontSize}
                  onBack={setRightPaneGitGraph}
                />
              )}

              {/* Commit content type - placeholder */}
              {rightPaneContent?.type === 'commit' && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <GitCommit size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 16px' }} />
                    <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                      Commit Details
                    </h3>
                    <p className="font-mono text-sm" style={{ color: 'var(--accent)' }}>
                      {rightPaneContent.hash.substring(0, 8)}
                    </p>
                    <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                      Coming soon
                    </p>
                  </div>
                </div>
              )}
            </div>
          }
        />

        {/* Chat Panel - Third column, independent of split view */}
        {chatPanelOpen && (
          <>
            {/* Resize handle for chat panel */}
            <div
              ref={chatResizeRef}
              className="w-1 flex-shrink-0 relative group cursor-col-resize"
              style={{ backgroundColor: 'var(--border)' }}
              onMouseDown={handleChatResizeMouseDown}
            >
              <div className="absolute inset-y-0 left-0 right-0 group-hover:bg-[var(--accent)] transition-colors" />
            </div>

            {/* Chat panel */}
            <div
              className="h-full flex flex-col overflow-hidden"
              style={{ width: `${chatPanelWidth}px`, flexShrink: 0 }}
            >
              <ChatPanel
                currentFile={currentFile}
                fontSize={appState.fontSize}
                onViewConversation={(path, sessionId, title) => {
                  openConversationTab(path, {
                    sessionId,
                    workingDir: workspacePath || '',
                    pane: '',
                    taskDescription: title,
                    autoClose: false,
                  });
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Archive Modal */}
      {showArchiveModal && archiveFilePath && (
        <ArchiveModal
          conversationPath={archiveFilePath}
          archiveLocation={appState.archiveLocation}
          onArchiveLocationChange={saveArchiveLocation}
          onArchiveComplete={handleArchiveComplete}
          onClose={() => { setShowArchiveModal(false); setArchiveFilePath(null); }}
        />
      )}
    </>
  );
}
