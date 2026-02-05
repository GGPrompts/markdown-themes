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
import { useTabManager } from '../hooks/useTabManager';
import { useSplitView } from '../hooks/useSplitView';
import { useRightPaneTabs } from '../hooks/useRightPaneTabs';
import { Toolbar } from '../components/Toolbar';
import { ViewerContainer } from '../components/ViewerContainer';
import { MetadataBar } from '../components/MetadataBar';
import { Sidebar } from '../components/Sidebar';
import { TabBar } from '../components/TabBar';
import { RightPaneTabBar } from '../components/RightPaneTabBar';
import { SplitView } from '../components/SplitView';
import { GitGraph, WorkingTree, MultiRepoView } from '../components/git';
import { DiffViewer } from '../components/viewers/DiffViewer';
import { ArchiveModal } from '../components/ArchiveModal';
import { parseFrontmatter } from '../utils/frontmatter';
import { themes } from '../themes';
import type { ArchivedConversation } from '../context/AppStoreContext';

const API_BASE = 'http://localhost:8129';

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const leftScrollContainerRef = useRef<HTMLDivElement>(null);
  const rightScrollContainerRef = useRef<HTMLDivElement>(null);

  // Track recently closed files to prevent circular auto-reopening (path -> close timestamp)
  const recentlyClosedRef = useRef<Map<string, number>>(new Map());
  const RECENTLY_CLOSED_TTL = 5000; // 5 seconds

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
  const { workspacePath, fileTree } = useWorkspaceContext();

  // Check if workspace is a git repo by looking for .git directory at root
  const isGitRepo = useMemo(() => {
    return fileTree.some((f) => f.name === '.git' && f.isDirectory);
  }, [fileTree]);

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
    closeTab: closeRightTab,
    setActiveTab: setRightActiveTab,
  } = useRightPaneTabs({
    initialTabs: filesState.rightPaneTabs,
    initialActiveTabId: filesState.rightActiveTabId,
    onStateChange: handleRightPaneTabsStateChange,
  });

  // Close split view when all right pane tabs are closed
  // Follow mode will re-open split when needed (see line ~388)
  useEffect(() => {
    if (rightPaneTabs.length === 0 && rightPaneContent?.type === 'file' && isSplit) {
      setRightFile(null);
      toggleSplit();
    }
  }, [rightPaneTabs.length, rightPaneContent?.type, isSplit, setRightFile, toggleSplit]);

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
    connected,
  } = useFileWatcher({
    path: isCurrentFileBinary ? null : currentFile,
  });

  // File watcher for right pane (only active when split view is enabled)
  const isRightPaneActiveConversation = isCurrentConversationFile(rightPaneFilePath);
  const {
    content: rightContent,
    error: rightError,
    loading: rightLoading,
    isStreaming: rightIsStreaming,
  } = useFileWatcher({
    path: isSplit && !isRightFileBinary ? rightPaneFilePath : null,
  });

  // Workspace streaming detection for follow mode and changed files tracking
  const { streamingFile, changedFiles } = useWorkspaceStreaming({
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

    // Only auto-open if the streaming file is different from current right pane file
    if (streamingFile !== rightPaneFilePath) {
      // Filter out noisy files that aren't useful to watch
      const fileName = streamingFile.split('/').pop() || '';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      // Skip internal/generated files
      if (
        streamingFile.includes('/.beads/') ||
        streamingFile.includes('/node_modules/') ||
        streamingFile.includes('/.git/') ||
        streamingFile.includes('/coverage/') ||
        streamingFile.includes('/.nyc_output/') ||
        streamingFile.includes('/dist/') ||
        streamingFile.includes('/build/') ||
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
        return;
      }

      // Only follow source code and documentation files
      const followableExtensions = new Set([
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

      if (!followableExtensions.has(ext)) {
        return;
      }

      // Don't reopen files that were recently closed by the user
      if (wasRecentlyClosed(streamingFile)) {
        return;
      }

      // Open streaming file in right pane tabs (enables split if needed)
      if (!isSplit) {
        toggleSplit();
      }
      // Use setRightPaneFile to ensure rightPaneContent is set to file mode
      setRightPaneFile(streamingFile);
      // Open as a tab (preview mode for AI edits)
      openRightTab(streamingFile, true);
      addRecentFile(streamingFile);
    }
  }, [appState.followStreamingMode, streamingFile, rightPaneFilePath, isSplit, toggleSplit, setRightPaneFile, openRightTab, addRecentFile, wasRecentlyClosed]);

  // Track files that have been auto-opened as tabs (to avoid re-opening)
  const autoOpenedFilesRef = useRef<Set<string>>(new Set());

  // Auto-open changed files as tabs in the RIGHT pane when Follow mode is active
  useEffect(() => {
    if (!appState.followStreamingMode || !isSplit) return;

    // Find new changed files that haven't been auto-opened yet
    const newChangedFiles: string[] = [];
    changedFiles.forEach((filePath) => {
      if (autoOpenedFilesRef.current.has(filePath)) return;

      // Check if file is already open as a tab in the right pane
      const existingTab = rightPaneTabs.find((t) => t.path === filePath);
      if (existingTab) return;

      // Apply the same filtering as the streaming file follow logic
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
        fileName.includes('.test-result') ||
        fileName.includes('.junit') ||
        (ext === 'json' && (
          fileName.includes('test') ||
          fileName.includes('result') ||
          fileName.includes('report') ||
          fileName.includes('coverage')
        )) ||
        ext === 'jsonl' ||
        ext === 'ndjson'
      ) {
        return;
      }

      // Only follow source code and documentation files
      const followableExtensions = new Set([
        'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
        'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
        'c', 'cpp', 'h', 'hpp', 'cs',
        'php', 'vue', 'svelte', 'astro',
        'md', 'mdx', 'markdown', 'txt', 'rst',
        'css', 'scss', 'sass', 'less',
        'json', 'yaml', 'yml', 'toml', 'ini',
        'xml', 'html', 'htm',
        'sh', 'bash', 'zsh',
      ]);

      if (followableExtensions.has(ext)) {
        newChangedFiles.push(filePath);
      }
    });

    // Open new tabs in the right pane as preview tabs
    newChangedFiles.forEach((filePath) => {
      autoOpenedFilesRef.current.add(filePath);
      openRightTab(filePath, true); // preview mode
    });
  }, [appState.followStreamingMode, isSplit, changedFiles, rightPaneTabs, openRightTab]);

  // Handle commit success - close tabs for committed files (review queue cleanup)
  // Right pane tabs act as a review queue; committed files are "done" and removed
  const handleCommitSuccess = useCallback((committedFiles: string[]) => {
    const committedSet = new Set(committedFiles);

    // Find and close ALL tabs in the right pane for committed files (preview or pinned)
    const tabsToClose = rightPaneTabs.filter((t) => committedSet.has(t.path));
    tabsToClose.forEach((t) => closeRightTab(t.id));

    // Remove from auto-opened tracking ref
    committedFiles.forEach((f) => autoOpenedFilesRef.current.delete(f));
  }, [rightPaneTabs, closeRightTab]);

  const themeClass = themes.find((t) => t.id === appState.theme)?.className ?? '';

  // Check if current file is markdown
  const isMarkdownFile = useMemo(() => {
    if (!currentFile) return false;
    const ext = currentFile.split('.').pop()?.toLowerCase();
    return ext === 'md' || ext === 'markdown' || ext === 'mdx';
  }, [currentFile]);

  // Check if current file is a conversation file (JSONL in ~/.claude/projects/)
  const isConversationFile = useMemo(() => {
    if (!currentFile) return false;
    const ext = currentFile.split('.').pop()?.toLowerCase();
    const isJsonl = ext === 'jsonl' || ext === 'ndjson';
    const isInClaudeProjects = currentFile.includes('/.claude/projects/');
    return isJsonl && isInClaudeProjects;
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
  // Always enabled when Follow AI mode is on, so we scroll even for slower edits
  useDiffAutoScroll({
    content: isRightMarkdownFile ? rightMarkdownContent : rightContent,
    isStreaming: rightIsStreaming || appState.followStreamingMode,
    scrollContainerRef: rightScrollContainerRef,
    filePath: rightPaneFilePath ?? undefined,
    enabled: rightIsStreaming || appState.followStreamingMode,
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
        toggleSplit();
      }
      setRightPaneGitGraph();
    }
  }, [rightPaneContent, isSplit, toggleSplit, setRightFile, setRightPaneGitGraph]);

  // Handle working tree toggle
  const handleWorkingTreeToggle = useCallback(() => {
    // If working tree is already shown, close the split view
    if (rightPaneContent?.type === 'working-tree') {
      setRightFile(null);
    } else {
      // Open split view with working tree
      if (!isSplit) {
        toggleSplit();
      }
      setRightPaneWorkingTree();
    }
  }, [rightPaneContent, isSplit, toggleSplit, setRightFile, setRightPaneWorkingTree]);

  // Handle hotkeys button - open HOTKEYS.md in right pane
  const handleHotkeysClick = useCallback(() => {
    if (!workspacePath) return;
    const hotkeysPath = workspacePath + '/HOTKEYS.md';
    if (!isSplit) {
      toggleSplit();
    }
    setRightPaneFile(hotkeysPath);
    openRightTab(hotkeysPath, false); // Open as pinned tab
  }, [workspacePath, isSplit, toggleSplit, setRightPaneFile, openRightTab]);

  // Handle view conversation button - open conversation JSONL file
  const handleViewConversation = useCallback(() => {
    if (!conversation?.conversationPath) return;
    openTab(conversation.conversationPath, false); // Open as pinned tab
    addRecentFile(conversation.conversationPath);
  }, [conversation, openTab, addRecentFile]);

  // Handle archive button click
  const handleArchiveClick = useCallback(() => {
    if (!currentFile || !isConversationFile) return;
    setShowArchiveModal(true);
  }, [currentFile, isConversationFile]);

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
  }, [toggleSplit, handleGitGraphToggle, handleWorkingTreeToggle, handleHotkeysClick]);

  return (
    <>
      <Toolbar
        currentFile={currentFile}
        isStreaming={isStreaming}
        connected={connected || isCurrentFileBinary || isLeftPaneActiveConversation}
        recentFiles={appState.recentFiles}
        fontSize={appState.fontSize}
        isSplit={isSplit}
        isGitGraph={rightPaneContent?.type === 'git-graph'}
        isWorkingTree={rightPaneContent?.type === 'working-tree'}
        isFollowMode={appState.followStreamingMode}
        content={content}
        workspacePath={workspacePath}
        conversationPath={conversation?.conversationPath ?? null}
        conversationLoading={conversationLoading}
        isConversationFile={isConversationFile}
        activeSubagentCount={activeSubagentCount}
        onFileSelect={handleFileSelect}
        onFontSizeChange={handleFontSizeChange}
        onSplitToggle={toggleSplit}
        onGitGraphToggle={handleGitGraphToggle}
        onWorkingTreeToggle={handleWorkingTreeToggle}
        onFollowModeToggle={toggleFollowMode}
        onHotkeysClick={handleHotkeysClick}
        onViewConversation={handleViewConversation}
        onArchiveClick={handleArchiveClick}
      />

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
              />

              {(activeTab?.type === 'file' || activeTab?.type === 'conversation') && loading && !content && (
                <div className="flex items-center justify-center h-full">
                  <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                </div>
              )}

              {(activeTab?.type === 'file' || activeTab?.type === 'conversation') && error && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-red-500 mb-2">{error}</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Make sure TabzChrome backend is running on port 8129
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
              {(activeTab?.type === 'file' || activeTab?.type === 'conversation') && !error && currentFile && content && (
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
                    onFileSelect={(path) => {
                      // Open the file in the left pane
                      handleFileSelect(path);
                    }}
                    onCommitSuccess={handleCommitSuccess}
                  />
                ) : (
                  <MultiRepoView
                    projectsDir={workspacePath}
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
      </div>

      {/* Archive Modal */}
      {showArchiveModal && currentFile && (
        <ArchiveModal
          conversationPath={currentFile}
          archiveLocation={appState.archiveLocation}
          onArchiveLocationChange={saveArchiveLocation}
          onArchiveComplete={handleArchiveComplete}
          onClose={() => setShowArchiveModal(false)}
        />
      )}
    </>
  );
}
