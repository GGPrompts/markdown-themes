import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Clock, ChevronLeft, GitCommit, FileDiff, Loader2 } from 'lucide-react';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useWorkspaceStreaming } from '../hooks/useWorkspaceStreaming';
import { useDiffAutoScroll } from '../hooks/useDiffAutoScroll';
import { useCurrentConversation } from '../hooks/useCurrentConversation';
import { useSubagentWatcher, type ActiveSubagent } from '../hooks/useSubagentWatcher';
import { useWorkspaceContext } from '../context/WorkspaceContext';
import { usePageState } from '../context/PageStateContext';
import { useAppStore } from '../hooks/useAppStore';
import { useAIChatContext } from '../context/AIChatContext';
import { useTabManager, type Tab } from '../hooks/useTabManager';
import { useSplitView } from '../hooks/useSplitView';
import { useRightPaneTabs } from '../hooks/useRightPaneTabs';
import { ViewerContainer } from '../components/ViewerContainer';
import { MetadataBar } from '../components/MetadataBar';
import { Sidebar } from '../components/Sidebar';
import { TabBar } from '../components/TabBar';
import { RightPaneTabBar } from '../components/RightPaneTabBar';
import { SplitView } from '../components/SplitView';
import { GitGraph, WorkingTree, MultiRepoView } from '../components/git';
import { BeadsBoard } from '../components/beads/BeadsBoard';
import { BeadsDetail } from '../components/beads/BeadsDetail';
import type { BeadsIssue } from '../lib/api';
import { DiffViewer } from '../components/viewers/DiffViewer';
import { ArchiveModal } from '../components/ArchiveModal';
import { FileContextMenu } from '../components/FileContextMenu';
import { ChatPanel } from '../components/chat';
import { ChatBubble } from '../components/ChatBubble';
import { TerminalPanel } from '../components/TerminalPanel';
import { TerminalProvider } from '../context/TerminalContext';
import { NotepadPanel } from '../components/NotepadPanel';
import type { TerminalTab } from '../hooks/useTerminal';
import { fetchFileContent } from '../lib/api';
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
  const [selectedBeadsIssue, setSelectedBeadsIssue] = useState<BeadsIssue | null>(null);

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
    openViewTab,
    closeViewTab,
    pinTab,
    unpinTab,
    closeTab,
    setActiveTab,
    reorderTab,
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
    saveSidebarWidth,
    toggleFavorite,
    isFavorite,
    toggleFollowMode,
    saveArchiveLocation,
    addArchivedConversation,
    saveTheme,
  } = useAppStore();

  // Local state for sidebar width during drag (for smooth updates)
  const [sidebarWidth, setSidebarWidth] = useState(appState.sidebarWidth);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveFilePath, setArchiveFilePath] = useState<string | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState({
    show: false, x: 0, y: 0,
    tabId: '', filePath: '', fileName: '',
    isPinned: false, isPreview: false,
    tabType: 'file' as Tab['type'],
    pane: 'left' as 'left' | 'right',
  });
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
  const { workspacePath, fileTree, isGitRepo, openWorkspace, closeWorkspace } = useWorkspaceContext();

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
    setRightPaneBeadsBoard,
  } = useSplitView({
    initialState: {
      isSplit: filesState.isSplit,
      splitRatio: filesState.splitRatio,
      rightPaneContent: filesState.rightPaneContent,
    },
    onStateChange: handleSplitStateChange,
  });

  // When split view closes and right pane had git-graph/working-tree/beads-board, move it to a tab
  // When split view opens and active tab is a view type, move it to right pane
  const prevIsSplitRef = useRef(isSplit);
  useEffect(() => {
    if (prevIsSplitRef.current && !isSplit) {
      // Split just closed - if right pane had git view, create a tab for it
      if (rightPaneContent?.type === 'git-graph') {
        openViewTab('git-graph');
      } else if (rightPaneContent?.type === 'working-tree') {
        openViewTab('working-tree');
      } else if (rightPaneContent?.type === 'beads-board') {
        openViewTab('beads-board');
      }
    } else if (!prevIsSplitRef.current && isSplit) {
      // Split just opened - if active tab is a view type, move to right pane
      const viewType = activeTab?.type;
      if (viewType === 'git-graph') {
        setRightPaneGitGraph();
        closeViewTab('git-graph');
      } else if (viewType === 'working-tree') {
        setRightPaneWorkingTree();
        closeViewTab('working-tree');
      } else if (viewType === 'beads-board') {
        setRightPaneBeadsBoard();
        closeViewTab('beads-board');
      }
    }
    prevIsSplitRef.current = isSplit;
  }, [isSplit, rightPaneContent?.type, activeTab?.type, setRightPaneGitGraph, setRightPaneWorkingTree, setRightPaneBeadsBoard, openViewTab, closeViewTab]);

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
    unpinTab: unpinRightTab,
    closeTab: closeRightTabInternal,
    setActiveTab: setRightActiveTab,
    reorderTab: reorderRightTab,
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

  // Third column state (switchable between chat and terminal)
  const [thirdColumnMode, setThirdColumnMode] = useState<'chat' | 'terminal'>(filesState.thirdColumnMode);
  const [thirdColumnOpen, setThirdColumnOpen] = useState(filesState.thirdColumnOpen);
  const [thirdColumnWidth, setThirdColumnWidth] = useState(filesState.thirdColumnWidth);
  const thirdColumnResizeRef = useRef<HTMLDivElement>(null);

  // Terminal tab state
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(filesState.terminalTabs);
  const [activeTerminalTabId, setActiveTerminalTabId] = useState<string | null>(filesState.activeTerminalTabId);
  const terminalSendInputRef = useRef<((id: string, data: string) => void) | null>(null);

  // Stable sendInput wrapper for TerminalContext
  const terminalSendInput = useCallback((id: string, data: string) => {
    terminalSendInputRef.current?.(id, data);
  }, []);

  // Open terminal panel callback for TerminalContext
  const openTerminalPanel = useCallback(() => {
    setThirdColumnOpen(true);
    setThirdColumnMode('terminal');
  }, []);

  // Notepad panel state
  const [notepadOpen, setNotepadOpen] = useState(false);
  const toggleNotepadPanel = useCallback(() => {
    setNotepadOpen(prev => !prev);
  }, []);

  const handleNotepadConversation = useCallback((path: string, sessionId: string) => {
    openConversationTab(path, {
      sessionId,
      workingDir: workspacePath || '',
      pane: '',
      taskDescription: 'Notepad',
      autoClose: false,
    });
  }, [openConversationTab, workspacePath]);

  // Persist third column state changes
  useEffect(() => {
    setFilesState({
      thirdColumnMode,
      thirdColumnOpen,
      thirdColumnWidth,
      terminalTabs,
      activeTerminalTabId,
    });
  }, [thirdColumnMode, thirdColumnOpen, thirdColumnWidth, terminalTabs, activeTerminalTabId, setFilesState]);

  // Toggle terminal panel
  const toggleTerminalPanel = useCallback(() => {
    setThirdColumnOpen((prev) => {
      if (!prev) setThirdColumnMode('terminal');
      return !prev || thirdColumnMode !== 'terminal';
    });
    if (!thirdColumnOpen) setThirdColumnMode('terminal');
  }, [thirdColumnOpen, thirdColumnMode]);

  // Toggle chat panel
  const toggleChatPanel = useCallback(() => {
    setThirdColumnOpen((prev) => {
      if (!prev) setThirdColumnMode('chat');
      return !prev || thirdColumnMode !== 'chat';
    });
    if (!thirdColumnOpen) setThirdColumnMode('chat');
  }, [thirdColumnOpen, thirdColumnMode]);

  // AI Chat integration for "Send to Chat", "Resume in Chat", and generating status
  const { sendToChat, resumeConversation, isGenerating } = useAIChatContext();
  const handleSendToChat = useCallback((content: string) => {
    setThirdColumnOpen(true);
    setThirdColumnMode('chat');
    sendToChat(content);
  }, [sendToChat]);

  const handleResumeInChat = useCallback((sessionId: string) => {
    setThirdColumnOpen(true);
    setThirdColumnMode('chat');
    resumeConversation(sessionId);
  }, [resumeConversation]);

  // Handle third column resize
  const handleThirdColumnResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = thirdColumnWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(900, startWidth + deltaX));
      setThirdColumnWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('resizing');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('resizing');
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [thirdColumnWidth]);

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
  const { conversation } = useCurrentConversation();

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
  const homePath = getHomePath(workspacePath);
  const extraWatchPaths = useMemo(() => [`${homePath}/.claude/plans`], [homePath]);
  const { streamingFile, changedFiles, removeChangedFiles } = useWorkspaceStreaming({
    workspacePath,
    enabled: true, // Always enabled to track changed files for the Changed filter
    extraWatchPaths,
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

  // Auto-open streaming file when follow mode is enabled
  // When split: opens in right pane. When not split: opens in main pane.
  useEffect(() => {
    if (!appState.followStreamingMode || !streamingFile) return;

    // Filter out noisy files that aren't useful to watch
    if (!shouldFollowFile(streamingFile)) return;

    if (isSplit) {
      // Split mode: open in right pane (existing behavior)
      const alreadyOpenAsTab = rightPaneTabs.some((t) => t.path === streamingFile);
      const alreadyVisible = streamingFile === rightPaneFilePath || alreadyOpenAsTab;
      if (!alreadyVisible) {
        if (wasRecentlyClosed(streamingFile)) return;
        if (!shouldAutoOpen(streamingFile)) return;

        setRightPaneFile(streamingFile);
        openRightTab(streamingFile, { preview: true, addNew: true });
        addRecentFile(streamingFile);
      }
    } else {
      // Non-split mode: open in main pane
      const alreadyOpen = currentFile === streamingFile;
      if (!alreadyOpen) {
        if (wasRecentlyClosed(streamingFile)) return;
        if (!shouldAutoOpen(streamingFile)) return;

        openTab(streamingFile, { preview: true, metadata: { autoOpened: true } }); // preview mode
        addRecentFile(streamingFile);
      }
    }
  }, [appState.followStreamingMode, streamingFile, rightPaneFilePath, rightPaneTabs, isSplit, currentFile, setRightPaneFile, openRightTab, openTab, addRecentFile, wasRecentlyClosed, shouldAutoOpen]);

  // Track files that have been auto-opened as tabs (to avoid re-opening)
  const autoOpenedFilesRef = useRef<Set<string>>(new Set());

  // Clear auto-opened tracking when workspace changes (prevents stale paths from old workspace)
  useEffect(() => {
    autoOpenedFilesRef.current.clear();
  }, [workspacePath]);

  // Auto-open changed files as tabs when Follow mode is active
  // When split: opens in right pane. When not split: opens in main pane.
  useEffect(() => {
    if (!appState.followStreamingMode) return;

    // Find new changed files that haven't been auto-opened yet
    const newChangedFiles: string[] = [];
    changedFiles.forEach((filePath) => {
      if (autoOpenedFilesRef.current.has(filePath)) return;

      // Check if file is already open as a tab
      if (isSplit) {
        const existingTab = rightPaneTabs.find((t) => t.path === filePath);
        if (existingTab) return;
      } else {
        const existingTab = tabs.find((t) => t.path === filePath);
        if (existingTab) return;
      }

      // Apply the shared file filtering logic
      if (!shouldFollowFile(filePath)) return;

      newChangedFiles.push(filePath);
    });

    if (newChangedFiles.length === 0) return;

    if (isSplit) {
      // Split mode: open in right pane
      newChangedFiles.forEach((filePath) => {
        if (!shouldAutoOpen(filePath)) return;
        autoOpenedFilesRef.current.add(filePath);
        openRightTab(filePath, { preview: true, addNew: true });
      });
    } else {
      // Non-split mode: open in main pane (just the most recent one)
      const latest = newChangedFiles[newChangedFiles.length - 1];
      if (shouldAutoOpen(latest)) {
        autoOpenedFilesRef.current.add(latest);
        openTab(latest, { preview: true, metadata: { autoOpened: true } });
      }
    }
  }, [appState.followStreamingMode, isSplit, changedFiles, rightPaneTabs, tabs, openRightTab, openTab, shouldAutoOpen]);

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
  // Sequential mode walks through ALL changed blocks when Follow AI Edits is active
  useDiffAutoScroll({
    content: isMarkdownFile ? markdownContent : content,
    isStreaming,
    scrollContainerRef: leftScrollContainerRef,
    filePath: currentFile ?? undefined,
    enabled: isStreaming && !isLeftPaneActiveConversation, // Disable auto-scroll for active conversation (handled by viewer)
    sequential: appState.followStreamingMode,
  });

  // Auto-scroll for right pane (used by Follow AI Edits)
  // Only scroll when content is actually changing (rightIsStreaming).
  // Follow mode controls auto-OPENING files, not auto-scrolling.
  // Auto-scroll is driven by actual content changes detected via diffing.
  // Sequential mode enabled when Follow AI Edits is active for guided tour experience.
  useDiffAutoScroll({
    content: isRightMarkdownFile ? rightMarkdownContent : rightContent,
    isStreaming: rightIsStreaming,
    scrollContainerRef: rightScrollContainerRef,
    filePath: rightPaneFilePath ?? undefined,
    enabled: rightIsStreaming,
    sequential: appState.followStreamingMode,
  });

  // Get recent files for empty state (limit to 6)
  const recentFilesForEmptyState = useMemo(() => {
    return appState.recentFiles.slice(0, 6);
  }, [appState.recentFiles]);

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
    if (isSplit) {
      // Split mode: use right pane (existing behavior)
      if (rightPaneContent?.type === 'git-graph') {
        setRightFile(null);
      } else {
        setRightPaneGitGraph();
      }
    } else {
      // Non-split mode: toggle as tab
      const existingTab = tabs.find((t) => t.type === 'git-graph');
      if (existingTab && existingTab.id === activeTabId) {
        closeViewTab('git-graph');
      } else if (existingTab) {
        setActiveTab(existingTab.id);
      } else {
        openViewTab('git-graph');
      }
    }
  }, [isSplit, rightPaneContent, setRightFile, setRightPaneGitGraph, tabs, activeTabId, closeViewTab, setActiveTab, openViewTab]);

  // Handle working tree toggle
  const handleWorkingTreeToggle = useCallback(() => {
    if (isSplit) {
      // Split mode: use right pane (existing behavior)
      if (rightPaneContent?.type === 'working-tree') {
        setRightFile(null);
      } else {
        setRightPaneWorkingTree();
      }
    } else {
      // Non-split mode: toggle as tab
      const existingTab = tabs.find((t) => t.type === 'working-tree');
      if (existingTab && existingTab.id === activeTabId) {
        closeViewTab('working-tree');
      } else if (existingTab) {
        setActiveTab(existingTab.id);
      } else {
        openViewTab('working-tree');
      }
    }
  }, [isSplit, rightPaneContent, setRightFile, setRightPaneWorkingTree, tabs, activeTabId, closeViewTab, setActiveTab, openViewTab]);

  // Handle beads board toggle
  const handleBeadsBoardToggle = useCallback(() => {
    if (isSplit) {
      if (rightPaneContent?.type === 'beads-board') {
        setRightFile(null);
      } else {
        setRightPaneBeadsBoard();
      }
    } else {
      // Non-split mode: toggle as tab
      const existingTab = tabs.find((t) => t.type === 'beads-board');
      if (existingTab && existingTab.id === activeTabId) {
        closeViewTab('beads-board');
      } else if (existingTab) {
        setActiveTab(existingTab.id);
      } else {
        openViewTab('beads-board');
      }
    }
  }, [isSplit, rightPaneContent, setRightFile, setRightPaneBeadsBoard, tabs, activeTabId, closeViewTab, setActiveTab, openViewTab]);

  // Handle issue selection from beads board — show detail in left pane
  const handleBeadsIssueSelect = useCallback((issue: BeadsIssue) => {
    setSelectedBeadsIssue(issue);
  }, []);

  // Wrap setActiveTab to clear beads detail when clicking a tab
  const handleTabSelect = useCallback((id: string) => {
    setSelectedBeadsIssue(null);
    setActiveTab(id);
  }, [setActiveTab]);

  // Handle chat panel toggle
  const handleChatPanelToggle = useCallback(() => {
    toggleChatPanel();
  }, [toggleChatPanel]);

  // Handle terminal panel toggle
  const handleTerminalToggle = useCallback(() => {
    toggleTerminalPanel();
  }, [toggleTerminalPanel]);

  // Handle hotkeys button - open HOTKEYS.md in right pane
  const handleHotkeysClick = useCallback(async () => {
    const hotkeysPath = '/home/marci/projects/markdown-themes/HOTKEYS.md';

    if (!isSplit) {
      openSplit();
    }
    setRightPaneFile(hotkeysPath);
    openRightTab(hotkeysPath, false); // Open as pinned tab
  }, [isSplit, openSplit, setRightPaneFile, openRightTab]);

  // Handle archive from sidebar context menu or other triggers
  const handleArchiveFile = useCallback((path: string) => {
    setArchiveFilePath(path);
    setShowArchiveModal(true);
  }, []);

  // Handle archive completion
  const handleArchiveComplete = useCallback((archive: ArchivedConversation) => {
    addArchivedConversation(archive);
  }, [addArchivedConversation]);

  // Tab context menu handlers
  const handleTabContextMenu = useCallback((e: React.MouseEvent, tab: { id: string; path: string; isPinned: boolean; isPreview: boolean; type?: string }, pane: 'left' | 'right') => {
    const fileName = tab.path.split('/').pop() ?? tab.path;
    setTabContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      tabId: tab.id,
      filePath: tab.path,
      fileName,
      isPinned: tab.isPinned,
      isPreview: tab.isPreview,
      tabType: (tab.type ?? 'file') as Tab['type'],
      pane,
    });
  }, []);

  const closeTabContextMenu = useCallback(() => {
    setTabContextMenu(prev => ({ ...prev, show: false }));
  }, []);

  const handleTabContextMenuPin = useCallback(() => {
    if (tabContextMenu.pane === 'left') {
      pinTab(tabContextMenu.tabId);
    } else {
      pinRightTab(tabContextMenu.tabId);
    }
  }, [tabContextMenu.pane, tabContextMenu.tabId, pinTab, pinRightTab]);

  const handleTabContextMenuUnpin = useCallback(() => {
    if (tabContextMenu.pane === 'left') {
      unpinTab(tabContextMenu.tabId);
    } else {
      unpinRightTab(tabContextMenu.tabId);
    }
  }, [tabContextMenu.pane, tabContextMenu.tabId, unpinTab, unpinRightTab]);

  const handleTabContextMenuClose = useCallback(() => {
    if (tabContextMenu.pane === 'left') {
      handleCloseTab(tabContextMenu.tabId);
    } else {
      closeRightTab(tabContextMenu.tabId);
    }
  }, [tabContextMenu.pane, tabContextMenu.tabId, handleCloseTab, closeRightTab]);

  const handleTabContextMenuCloseOthers = useCallback(() => {
    if (tabContextMenu.pane === 'left') {
      tabs.forEach(t => {
        if (t.id !== tabContextMenu.tabId) handleCloseTab(t.id);
      });
    } else {
      rightPaneTabs.forEach(t => {
        if (t.id !== tabContextMenu.tabId) closeRightTab(t.id);
      });
    }
  }, [tabContextMenu.pane, tabContextMenu.tabId, tabs, rightPaneTabs, handleCloseTab, closeRightTab]);

  const handleTabContextMenuCopyContent = useCallback(async () => {
    try {
      const fileContent = await fetchFileContent(tabContextMenu.filePath);
      await navigator.clipboard.writeText(fileContent.content);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  }, [tabContextMenu.filePath]);

  const handleTabContextMenuSendToChat = useCallback(async () => {
    try {
      const fileContent = await fetchFileContent(tabContextMenu.filePath);
      const message = `\`\`\`${tabContextMenu.fileName}\n${fileContent.content}\n\`\`\``;
      handleSendToChat(message);
    } catch (err) {
      console.error('Failed to send to chat:', err);
    }
  }, [tabContextMenu.filePath, tabContextMenu.fileName, handleSendToChat]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input/textarea or focused in a terminal.
      // Check both e.target and document.activeElement — the CanvasAddon can cause
      // the event target and focused element to differ.
      const target = e.target as HTMLElement;
      const active = document.activeElement as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (target?.closest?.('.terminal-container') || active?.closest?.('.terminal-container')) {
        return;
      }
      // Don't handle if an iframe (e.g. HTML game viewer) is focused
      if (target instanceof HTMLIFrameElement || active instanceof HTMLIFrameElement) {
        return;
      }

      // / - Focus search
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Ctrl/Cmd + B or Alt + [ - Toggle sidebar
      if (((e.ctrlKey || e.metaKey) && e.key === 'b') || (e.altKey && e.key === '[')) {
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

      // Ctrl/Cmd + Shift + B - Toggle beads board
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        handleBeadsBoardToggle();
        return;
      }

      // Ctrl/Cmd + Shift + C or Alt + ] - Toggle AI chat panel
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') || (e.altKey && e.key === ']')) {
        e.preventDefault();
        handleChatPanelToggle();
        return;
      }

      // Ctrl + ` - Toggle terminal panel
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        handleTerminalToggle();
        return;
      }

      // Ctrl/Cmd + Shift + N - Toggle notepad panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        toggleNotepadPanel();
        return;
      }

      // Ctrl + Shift + T - New terminal tab
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        // Open terminal panel if not open, tab creation handled by TerminalPanel auto-spawn
        if (!thirdColumnOpen || thirdColumnMode !== 'terminal') {
          setThirdColumnOpen(true);
          setThirdColumnMode('terminal');
        }
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
  }, [toggleSplit, handleGitGraphToggle, handleWorkingTreeToggle, handleBeadsBoardToggle, handleChatPanelToggle, handleTerminalToggle, toggleNotepadPanel, handleHotkeysClick, thirdColumnOpen, thirdColumnMode]);

  return (
    <TerminalProvider
      sendInput={terminalSendInput}
      activeTerminalTabId={activeTerminalTabId}
      openTerminal={openTerminalPanel}
    >
      <div className="flex-1 flex overflow-hidden">
        {workspacePath && sidebarVisible && (
          <Sidebar
            key={workspacePath}
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
            onResumeInChat={handleResumeInChat}
            recentFolders={appState.recentFolders}
            onFolderSelect={openWorkspace}
            onCloseWorkspace={closeWorkspace}
            currentTheme={appState.theme}
            onThemeChange={saveTheme}
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
          rightPaneTabBar={
            <RightPaneTabBar
              tabs={rightPaneTabs}
              activeTabId={rightActiveTabId}
              onTabSelect={setRightActiveTab}
              onTabClose={closeRightTab}
              onTabPin={pinRightTab}
              onTabUnpin={unpinRightTab}
              onTabContextMenu={(e, tab) => handleTabContextMenu(e, { ...tab, type: 'file' }, 'right')}
              onReorderTab={reorderRightTab}
            />
          }
          leftPane={
            <div className="flex-1 flex flex-col overflow-hidden">
              <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onTabSelect={handleTabSelect}
                onTabClose={handleCloseTab}
                onTabPin={pinTab}
                onTabUnpin={unpinTab}
                streamingFilePath={streamingFile}
                onTabContextMenu={(e, tab) => handleTabContextMenu(e, tab, 'left')}
                isGitGraph={tabs.some((t) => t.type === 'git-graph') || rightPaneContent?.type === 'git-graph'}
                isWorkingTree={tabs.some((t) => t.type === 'working-tree') || rightPaneContent?.type === 'working-tree'}
                isBeadsBoard={tabs.some((t) => t.type === 'beads-board') || rightPaneContent?.type === 'beads-board'}
                onGitGraphToggle={handleGitGraphToggle}
                onWorkingTreeToggle={handleWorkingTreeToggle}
                onBeadsBoardToggle={handleBeadsBoardToggle}
                onHotkeysClick={handleHotkeysClick}
                isFollowMode={appState.followStreamingMode}
                onFollowModeToggle={toggleFollowMode}
                activeSubagentCount={activeSubagentCount}
                isSplit={isSplit}
                onSplitToggle={toggleSplit}
                isTerminalOpen={thirdColumnOpen && thirdColumnMode === 'terminal'}
                onTerminalToggle={handleTerminalToggle}
                isNotepadOpen={notepadOpen}
                onNotepadToggle={toggleNotepadPanel}
                onReorderTab={reorderTab}
              />

              {/* Git graph in main pane (as tab) */}
              {activeTab?.type === 'git-graph' && workspacePath && (
                <GitGraph
                  repoPath={workspacePath}
                  onCommitSelect={(hash) => console.log('Selected commit:', hash)}
                  onFileClick={(commitHash, filePath) => {
                    openDiffTab(commitHash, filePath);
                  }}
                  fontSize={appState.fontSize}
                />
              )}

              {/* Working tree in main pane (as tab) */}
              {activeTab?.type === 'working-tree' && workspacePath && (
                isGitRepo ? (
                  <WorkingTree
                    repoPath={workspacePath}
                    fontSize={appState.fontSize}
                    onFileSelect={handleFileSelect}
                    onCommitSuccess={handleCommitSuccess}
                  />
                ) : (
                  <MultiRepoView
                    projectsDir={workspacePath}
                    fontSize={appState.fontSize}
                    onFileSelect={handleFileSelect}
                  />
                )
              )}

              {/* Beads issue detail in main pane (selected from board) */}
              {selectedBeadsIssue && activeTab?.type !== 'beads-board' && (
                <BeadsDetail
                  issue={selectedBeadsIssue}
                  fontSize={appState.fontSize}
                  onBack={() => setSelectedBeadsIssue(null)}
                />
              )}

              {/* Beads board in main pane (as tab) */}
              {activeTab?.type === 'beads-board' && (
                <BeadsBoard
                  workspacePath={workspacePath}
                  fontSize={appState.fontSize}
                />
              )}

              {/* File viewer content (default main pane view) */}
              {!selectedBeadsIssue && (!activeTab || activeTab.type === 'file' || activeTab.type === 'diff' || activeTab.type === 'conversation') && (
                <>
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
                </>
              )}

              {/* Notepad bottom panel */}
              {notepadOpen && (
                <NotepadPanel
                  workspacePath={workspacePath}
                  onOpenConversation={handleNotepadConversation}
                />
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

              {/* Beads board content type */}
              {rightPaneContent?.type === 'beads-board' && (
                <BeadsBoard
                  workspacePath={workspacePath}
                  fontSize={appState.fontSize}
                  onSelectIssue={handleBeadsIssueSelect}
                />
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

        {/* Third column — Chat or Terminal panel */}
        {thirdColumnOpen && (
          <>
            {/* Resize handle */}
            <div
              ref={thirdColumnResizeRef}
              className="w-1 flex-shrink-0 relative group cursor-col-resize"
              style={{ backgroundColor: 'var(--border)' }}
              onMouseDown={handleThirdColumnResizeMouseDown}
            >
              <div className="absolute inset-y-0 left-0 right-0 group-hover:bg-[var(--accent)] transition-colors" />
            </div>

            {thirdColumnMode === 'chat' && (
              <div
                className="h-full flex flex-col overflow-hidden"
                style={{ width: `${thirdColumnWidth}px`, flexShrink: 0 }}
              >
                <ChatPanel
                  currentFile={currentFile}
                  fontSize={appState.fontSize}
                  onClose={handleChatPanelToggle}
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
            )}
          </>
        )}

        {/* Terminal panel — always mounted to preserve xterm instances, hidden via CSS */}
        <div
          className="h-full flex flex-col"
          style={{
            width: `${thirdColumnWidth}px`,
            flexShrink: 0,
            display: thirdColumnOpen && thirdColumnMode === 'terminal' ? 'flex' : 'none',
          }}
        >
          <TerminalPanel
            tabs={terminalTabs}
            activeTabId={activeTerminalTabId}
            workspacePath={workspacePath || ''}
            fontSize={14}
            themeId={appState.theme}
            onTabsChange={setTerminalTabs}
            onActiveTabChange={setActiveTerminalTabId}
            onClose={handleTerminalToggle}
            sendInputRef={terminalSendInputRef}
          />
        </div>
      </div>

      {/* Tab context menu */}
      <FileContextMenu
        show={tabContextMenu.show}
        x={tabContextMenu.x}
        y={tabContextMenu.y}
        filePath={tabContextMenu.filePath}
        isDirectory={false}
        isFavorite={isFavorite(tabContextMenu.filePath)}
        onClose={closeTabContextMenu}
        onToggleFavorite={() => toggleFavorite(tabContextMenu.filePath, false)}
        onCopyContent={tabContextMenu.tabType === 'file' ? handleTabContextMenuCopyContent : undefined}
        onSendToChat={tabContextMenu.tabType === 'file' ? handleTabContextMenuSendToChat : undefined}
        onOpenInBrowser={
          (tabContextMenu.filePath.endsWith('.html') || tabContextMenu.filePath.endsWith('.htm'))
            ? () => window.open(`http://localhost:8130/api/files/serve${tabContextMenu.filePath}`, '_blank')
            : undefined
        }
        onPin={!tabContextMenu.isPinned ? handleTabContextMenuPin : undefined}
        onUnpin={tabContextMenu.isPinned ? handleTabContextMenuUnpin : undefined}
        onCloseTab={handleTabContextMenuClose}
        onCloseOtherTabs={handleTabContextMenuCloseOthers}
      />

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

      {/* Floating chat bubble */}
      <ChatBubble
        isGenerating={isGenerating}
        isChatOpen={thirdColumnOpen && thirdColumnMode === 'chat'}
        isTerminalOpen={thirdColumnOpen && thirdColumnMode === 'terminal'}
        onToggleChat={handleChatPanelToggle}
        onToggleTerminal={handleTerminalToggle}
      />
    </TerminalProvider>
  );
}
