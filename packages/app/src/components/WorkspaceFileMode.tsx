import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSize } from "../hooks/use-size.js";
import { useWorkspaceView } from "../hooks/use-workspace-view.js";
import { BG, COLORS } from "../theme/colors.js";
import { workspacePanelHint } from "../utils/keyboard-labels.js";
import {
  clearWorkspaceDiffStatsCache,
  fetchWorkspaceDiffStats,
  type WorkspaceDiffStats,
} from "../utils/workspace-diff-stats.js";
import { clearWorkspaceFileListCache } from "../utils/workspace-file-search.js";
import { clearWorkspaceDiffCache } from "../utils/workspace-git-diff.js";
import { fetchWorkspaceGitInfo, type WorkspaceGitInfo } from "../utils/workspace-git-info.js";
import { joinWorkspacePath } from "../utils/workspace-path.js";
import { ensureIndexVisible } from "../utils/workspace-scroll.js";

import { clearContentCache, FileContent } from "./FileContent.js";
import { FileDiffContent } from "./FileDiffContent.js";
import {
  clearDirCache,
  clearGitStatusCache,
  computeDirStatuses,
  fetchGitStatus,
  FileTree,
  useDiffFileTree,
  useFileTree,
} from "./FileTree.js";
import { WorkspaceQuickOpen } from "./WorkspaceQuickOpen.js";

import type { CodeViewRef, DiffViewRef } from "@git-diff-view/cli";
import type { ReactNode } from "react";

// ============================================================================
// Constants
// ============================================================================

const TREE_WIDTH_RATIO = 0.34;
const MIN_TREE_WIDTH = 28;
const MIN_PREVIEW_WIDTH = 24;
const HEADER_LINES = 1;
const FOOTER_LINES = 1;
const PANE_TITLE_LINES = 1;
const PREVIEW_SCROLL_STEP = 3;

// ============================================================================
// Pane shell
// ============================================================================

const WorkspacePane = ({
  title,
  active,
  width,
  height,
  children,
}: {
  title: string;
  active: boolean;
  width: number | undefined;
  height: number;
  children: ReactNode;
}) => (
  <Box
    flexDirection="column"
    width={width}
    height={height}
    flexGrow={width ? 0 : 1}
    flexShrink={0}
    borderStyle="single"
    borderColor={active ? COLORS.primary : BG.border}
  >
    <Box flexShrink={0} paddingX={1} height={PANE_TITLE_LINES}>
      <Text bold color={active ? COLORS.primary : COLORS.muted}>
        {title}
      </Text>
    </Box>
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
      {children}
    </Box>
  </Box>
);

// ============================================================================
// File mode
// ============================================================================

export const WorkspaceFileMode = () => {
  const paneFocus = useWorkspaceView((s) => s.paneFocus);
  const mode = useWorkspaceView((s) => s.mode);
  const selectedPath = useWorkspaceView((s) => s.selectedPath);
  const treeScrollTop = useWorkspaceView((s) => s.treeScrollTop);
  const quickOpen = useWorkspaceView((s) => s.quickOpen);
  const { close, openQuickOpen, selectFile, setPaneFocus, toggleMode, setTreeScrollTop } =
    useWorkspaceView.getActions();

  const previewRef = useRef<CodeViewRef>(null);
  const diffRef = useRef<DiffViewRef>(null);

  const scrollActivePane = useCallback(
    (direction: "up" | "down" | "top") => {
      const ref = mode === "preview" ? previewRef.current : diffRef.current;
      if (!ref) return;
      if (direction === "top") ref.scrollToTop(1);
      else if (direction === "up") ref.scrollUp({ step: PREVIEW_SCROLL_STEP });
      else ref.scrollDown({ step: PREVIEW_SCROLL_STEP });
    },
    [mode]
  );

  const screenWidth = useSize((s) => s.state.screenWidth);
  const screenHeight = useSize((s) => s.state.screenHeight) || 24;

  const [rootPath, setRootPath] = useState("");
  const [gitStatus, setGitStatus] = useState<Map<string, string>>(new Map());
  const [gitInfo, setGitInfo] = useState<WorkspaceGitInfo | null>(null);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [diffStats, setDiffStats] = useState<WorkspaceDiffStats | null>(null);

  const bodyHeight = Math.max(10, screenHeight - HEADER_LINES - FOOTER_LINES);
  const paneBodyLines = Math.max(4, bodyHeight - PANE_TITLE_LINES - 2);
  const treeWidth = Math.max(MIN_TREE_WIDTH, Math.floor(screenWidth * TREE_WIDTH_RATIO));
  const previewWidth = Math.max(MIN_PREVIEW_WIDTH, screenWidth - treeWidth - 2);
  const rightPaneTitle = mode === "preview" ? "Preview" : "Diff";

  const isDiffMode = mode === "diff";

  const { items: fullItems, loading: treeLoading, toggleDir, reload, revealPath } = useFileTree(rootPath);
  const { items: diffItems, toggleDir: toggleDiffDir } = useDiffFileTree(gitStatus, rootPath);

  // Diff mode lists only changed files (preprocessed, merged-prefix tree);
  // preview mode shows the full workspace tree.
  const items = isDiffMode ? diffItems : fullItems;
  const handleToggleDir = isDiffMode ? toggleDiffDir : toggleDir;

  const dirStatuses = useMemo(() => computeDirStatuses(gitStatus, rootPath), [gitStatus, rootPath]);

  const moveCursor = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, Math.max(0, items.length - 1)));
      setCursorIndex(clamped);
      const currentScroll = useWorkspaceView.getReadonlyState().treeScrollTop;
      setTreeScrollTop(ensureIndexVisible(clamped, currentScroll, paneBodyLines, items.length));
    },
    [items.length, paneBodyLines, setTreeScrollTop]
  );

  // Jump between files that have git changes (`[` / `]`), wrapping around.
  // Uses the git-status changed-file set directly (sorted), so it works on both
  // the full-tree view and the diff view — even when a changed file's directory
  // is collapsed in the full tree (the target is revealed + scrolled by the
  // selectedPath effect below).
  const jumpToChanged = useCallback(
    (direction: 1 | -1) => {
      const changed = [...gitStatus.keys()].map((rel) => joinWorkspacePath(rootPath, rel)).sort();
      if (changed.length === 0) return;
      const cur = selectedPath ? changed.indexOf(selectedPath) : -1;
      let next: number;
      if (direction > 0) next = cur < 0 ? 0 : cur + 1 >= changed.length ? 0 : cur + 1;
      else next = cur < 0 ? changed.length - 1 : cur - 1 < 0 ? changed.length - 1 : cur - 1;
      const target = changed[next]!;
      if (target === selectedPath) return;
      selectFile(target);
    },
    [gitStatus, rootPath, selectedPath, selectFile]
  );

  const refreshGit = useCallback(async (path: string) => {
    if (!path) return;
    try {
      clearGitStatusCache();
      clearWorkspaceDiffStatsCache();
      const status = await fetchGitStatus(path);
      const untracked = [...status.entries()].filter(([, s]) => s.trim() === "??").map(([rel]) => rel);
      const [info, stats] = await Promise.all([fetchWorkspaceGitInfo(path), fetchWorkspaceDiffStats(path, untracked)]);
      setGitStatus(new Map(status));
      setGitInfo(info);
      setDiffStats(stats);
    } catch {
      setGitStatus(new Map());
      setGitInfo(null);
      setDiffStats(null);
    }
  }, []);

  useEffect(() => {
    import("@my-agent/core")
      .then(({ getEnv }) => {
        const path = getEnv().rootPath;
        setRootPath(path);
        return refreshGit(path);
      })
      .catch(() => {});
  }, [refreshGit]);

  useEffect(() => {
    if (!rootPath) return;
    const interval = setInterval(() => {
      void refreshGit(rootPath);
    }, 10_000);
    return () => clearInterval(interval);
  }, [rootPath, refreshGit]);

  useEffect(() => {
    setCursorIndex((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  // Track which paths we've already asked revealPath to expand (so the effect
  // below resolves post-reveal once `items` recomputes, without re-firing the
  // async load on every render).
  const revealedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedPath) return;
    // In the full-tree view, ensure the selected file's ancestor directories are
    // expanded so it is present in `items` (and can be scrolled into view).
    if (!isDiffMode && !revealedRef.current.has(selectedPath)) {
      revealedRef.current.add(selectedPath);
      void revealPath(selectedPath);
    }
    const index = items.findIndex((item) => item.path === selectedPath);
    if (index < 0) return;
    setCursorIndex(index);
    const currentScroll = useWorkspaceView.getReadonlyState().treeScrollTop;
    setTreeScrollTop(ensureIndexVisible(index, currentScroll, paneBodyLines, items.length));
    // Re-run when items change (post-reveal / mode switch) so the reveal + scroll
    // settle on a location the file is actually present in.
  }, [selectedPath, items, isDiffMode, revealPath, paneBodyLines, setTreeScrollTop]);

  useInput((inputChar, key) => {
    // The quick-open overlay owns the keyboard while it is up.
    if (quickOpen) return;

    if (key.tab) {
      toggleMode();
      return;
    }

    if (key.escape) {
      close();
      return;
    }

    if (inputChar === "r" && !key.ctrl) {
      clearDirCache();
      clearGitStatusCache();
      clearWorkspaceDiffStatsCache();
      clearWorkspaceFileListCache();
      clearContentCache();
      clearWorkspaceDiffCache();
      reload();
      scrollActivePane("top");
      setRefreshToken((t) => t + 1);
      revealedRef.current.clear();
      void refreshGit(rootPath);
      return;
    }

    if (key.ctrl && inputChar === "p") {
      openQuickOpen();
      return;
    }

    if (inputChar === "]" || inputChar === "[") {
      jumpToChanged(inputChar === "]" ? 1 : -1);
      return;
    }

    if (paneFocus === "tree") {
      if (key.upArrow) {
        moveCursor(cursorIndex - 1);
        return;
      }
      if (key.downArrow) {
        moveCursor(cursorIndex + 1);
        return;
      }
      if (key.rightArrow) {
        const current = items[cursorIndex];
        if (!current) return;
        if (current.type === "directory") {
          if (!current.expanded) {
            void handleToggleDir(current.path);
            return;
          }
          setPaneFocus("preview");
          return;
        }
        if (selectedPath === current.path) {
          setPaneFocus("preview");
          return;
        }
        selectFile(current.path);
        return;
      }
      if (key.leftArrow) {
        const current = items[cursorIndex];
        if (current?.type === "directory" && current.expanded) {
          void handleToggleDir(current.path);
          return;
        }
        if (current && current.indent > 0) {
          for (let i = cursorIndex - 1; i >= 0; i--) {
            const candidate = items[i];
            if (candidate && candidate.indent === current.indent - 1) {
              moveCursor(i);
              break;
            }
          }
        }
        return;
      }
      if (key.return) {
        const current = items[cursorIndex];
        if (!current) return;
        if (current.type === "directory") void handleToggleDir(current.path);
        else selectFile(current.path);
      }
      return;
    }

    if (paneFocus === "preview") {
      if (key.leftArrow) {
        setPaneFocus("tree");
        return;
      }
      if (key.rightArrow) {
        return;
      }
      if (!selectedPath) return;

      if (key.upArrow) {
        scrollActivePane("up");
        return;
      }
      if (key.downArrow) {
        scrollActivePane("down");
      }
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} width={screenWidth} height={bodyHeight + HEADER_LINES + FOOTER_LINES}>
      <Box flexShrink={0} height={HEADER_LINES} paddingX={1}>
        <Text bold color={COLORS.primary}>
          Workspace
        </Text>
        <Text color={COLORS.muted} dimColor>
          {" "}
          {mode} · {rootPath || "…"}
        </Text>
        {gitInfo && (
          <>
            <Text color={COLORS.muted} dimColor>
              {" "}
              ·{" "}
            </Text>
            <Text color={COLORS.primary}>
              {gitInfo.branch}
              {gitInfo.dirty ? "*" : ""}
            </Text>
            {gitInfo.shortSha && !gitInfo.branch.includes(gitInfo.shortSha) ? (
              <Text color={COLORS.muted} dimColor>
                {" "}
                {gitInfo.shortSha}
              </Text>
            ) : null}
            {(gitInfo.ahead > 0 || gitInfo.behind > 0) && (
              <Text color={gitInfo.behind > 0 ? COLORS.warning : COLORS.muted} dimColor={gitInfo.behind === 0}>
                {" "}
                {gitInfo.behind > 0 ? `↓${gitInfo.behind}` : ""}
                {gitInfo.ahead > 0 && gitInfo.behind > 0 ? " " : ""}
                {gitInfo.ahead > 0 ? `↑${gitInfo.ahead}` : ""}
              </Text>
            )}
          </>
        )}
        {diffStats && (diffStats.totalAdded > 0 || diffStats.totalDeleted > 0) && (
          <>
            <Text color={COLORS.muted} dimColor>
              {" "}
              ·{" "}
            </Text>
            <Text color={COLORS.muted}>{diffStats.files.size} files</Text>
            <Text color={COLORS.success}> +{diffStats.totalAdded}</Text>
            <Text color={COLORS.danger}>−{diffStats.totalDeleted}</Text>
          </>
        )}
      </Box>

      {quickOpen ? (
        <WorkspaceQuickOpen rootPath={rootPath} width={screenWidth} height={bodyHeight} />
      ) : (
        <Box flexDirection="row" flexGrow={1} height={bodyHeight} gap={0}>
          <WorkspacePane
            title={isDiffMode ? "Changed Files" : "Files"}
            active={paneFocus === "tree"}
            width={treeWidth}
            height={bodyHeight}
          >
            <FileTree
              items={items}
              gitStatus={gitStatus}
              dirStatuses={dirStatuses}
              rootPath={rootPath}
              cursorIndex={cursorIndex}
              selectedPath={selectedPath}
              scrollTop={treeScrollTop}
              visibleCount={paneBodyLines}
              loading={isDiffMode ? gitStatus.size === 0 && treeLoading : treeLoading}
              emptyLabel={isDiffMode ? "(no changes)" : undefined}
              diffStats={diffStats?.files ?? null}
            />
          </WorkspacePane>

          <WorkspacePane title={rightPaneTitle} active={paneFocus === "preview"} width={undefined} height={bodyHeight}>
            {selectedPath ? (
              mode === "preview" ? (
                <FileContent
                  key={refreshToken}
                  ref={previewRef}
                  filePath={selectedPath}
                  width={previewWidth - 2}
                  height={paneBodyLines}
                />
              ) : (
                <FileDiffContent
                  key={refreshToken}
                  ref={diffRef}
                  rootPath={rootPath}
                  filePath={selectedPath}
                  width={previewWidth - 2}
                  height={paneBodyLines}
                />
              )
            ) : (
              <Box height={paneBodyLines} alignItems="center" justifyContent="center">
                <Text color={COLORS.muted} dimColor>
                  Select a file (→) to preview
                </Text>
              </Box>
            )}
          </WorkspacePane>
        </Box>
      )}

      <Box flexShrink={0} height={FOOTER_LINES} paddingX={1}>
        <Text color={COLORS.muted} dimColor>
          {workspacePanelHint()}
        </Text>
      </Box>
    </Box>
  );
};
