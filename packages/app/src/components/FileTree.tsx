import { Box, Text } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BG, COLORS } from "../theme/colors.js";
import { formatFolderGlyph, formatIconGlyph, getFileIconStyle, getFolderIconStyle } from "../utils/file-icons.js";
import { splitStreamingLines } from "../utils/streaming-output-lines.js";
import { buildDiffTreeItems, type FlatTreeItem } from "../utils/workspace-diff-tree.js";
import { joinWorkspacePath, workspaceRelativePath } from "../utils/workspace-path.js";

import type { WorkspaceFileDiffStat } from "../utils/workspace-diff-stats.js";
import type { FileEntry } from "@my-agent/core";

// ============================================================================
// Dir Cache
// ============================================================================

const dirCache = new Map<string, FileEntry[]>();

export function clearDirCache(): void {
  dirCache.clear();
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

// ============================================================================
// Git Status
// ============================================================================

export function parseGitStatus(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of splitStreamingLines(raw)) {
    if (line.length < 3) continue;
    const status = line.slice(0, 2).trim();
    const filepath = line.slice(3).trim();
    if (!filepath) continue;
    // Rename rows look like "R  old/path -> new/path" — index both sides so the
    // tree can render the old (deleted) and new (added) paths as separate rows.
    const rename = filepath.match(/^(.*) -> (.*)$/);
    const normalized = (p: string) => p.replace(/\\/g, "/");
    if (rename) {
      map.set(normalized(rename[1]!), status);
      map.set(normalized(rename[2]!), status);
    } else {
      map.set(normalized(filepath), status);
    }
  }
  return map;
}

let gitStatusCache: { rootPath: string; status: Map<string, string> } | null = null;

export function clearGitStatusCache(): void {
  gitStatusCache = null;
}

export async function fetchGitStatus(rootPath: string): Promise<Map<string, string>> {
  if (gitStatusCache && gitStatusCache.rootPath === rootPath) {
    return gitStatusCache.status;
  }
  try {
    const { getEnv } = await import("@my-agent/core");
    const result = await getEnv().runCommand("git status --porcelain", {
      cwd: rootPath,
    });
    const status = parseGitStatus(result.stdout);
    gitStatusCache = { rootPath, status };
    return status;
  } catch {
    return new Map();
  }
}

export function lookupGitStatus(
  gitStatus: Map<string, string>,
  rootPath: string,
  fullPath: string
): string | undefined {
  const relative = workspaceRelativePath(rootPath, fullPath);
  return gitStatus.get(relative) ?? gitStatus.get(relative.replace(/\\/g, "/"));
}

// ============================================================================
// Status Style
// ============================================================================

interface StatusStyle {
  label: string;
  color: string;
}

function getStatusStyle(status: string): StatusStyle | null {
  const s = status.trim();
  if (s.startsWith("M") || s.endsWith("M")) return { label: "M", color: COLORS.warning };
  if (s === "??") return { label: "?", color: COLORS.success };
  if (s.startsWith("A")) return { label: "A", color: COLORS.success };
  if (s.startsWith("D")) return { label: "D", color: COLORS.danger };
  if (s.startsWith("R")) return { label: "R", color: COLORS.primary };
  if (s.startsWith("C")) return { label: "C", color: COLORS.primary };
  return null;
}

// ============================================================================
// Directory Status Aggregation
// ============================================================================

interface DirStatusSummary {
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  renamed: number;
  total: number;
}

/**
 * Compute aggregated git status for all directories by walking the git status map.
 * A directory's status is the summary of all files under it (recursively).
 */
export function computeDirStatuses(gitStatus: Map<string, string>, rootPath: string): Map<string, DirStatusSummary> {
  const dirStatuses = new Map<string, DirStatusSummary>();

  const ensureDir = (dir: string): DirStatusSummary => {
    if (!dirStatuses.has(dir)) {
      dirStatuses.set(dir, { modified: 0, added: 0, deleted: 0, untracked: 0, renamed: 0, total: 0 });
    }
    return dirStatuses.get(dir)!;
  };

  for (const [filepath, status] of gitStatus) {
    const parts = filepath.replace(/\\/g, "/").split("/");
    // Accumulate status into every ancestor directory, using absolute paths
    for (let i = 1; i < parts.length; i++) {
      const relativeDir = parts.slice(0, i).join("/");
      const dir = joinWorkspacePath(rootPath, relativeDir);
      const summary = ensureDir(dir);
      const s = status.trim();
      if (s.startsWith("M") || s.endsWith("M")) summary.modified++;
      else if (s.startsWith("A")) summary.added++;
      else if (s.startsWith("D")) summary.deleted++;
      else if (s === "??") summary.untracked++;
      else if (s.startsWith("R")) summary.renamed++;
      summary.total++;
    }
  }

  return dirStatuses;
}

/**
 * Format directory status summary for display.
 * Example: "3M 1A" or "2? 1D"
 */
function formatDirStatus(summary: DirStatusSummary | undefined): string | null {
  if (!summary || summary.total === 0) return null;
  const parts: string[] = [];
  if (summary.modified > 0) parts.push(`${summary.modified}M`);
  if (summary.added > 0) parts.push(`${summary.added}A`);
  if (summary.deleted > 0) parts.push(`${summary.deleted}D`);
  if (summary.untracked > 0) parts.push(`${summary.untracked}?`);
  if (summary.renamed > 0) parts.push(`${summary.renamed}R`);
  return parts.length > 0 ? parts.join(" ") : null;
}

// ============================================================================
// useFileTree
// ============================================================================

export function useFileTree(rootPath: string): {
  items: FlatTreeItem[];
  loading: boolean;
  toggleDir: (path: string) => Promise<void>;
  reload: () => void;
  revealPath: (path: string) => Promise<void>;
} {
  const [dirData, setDirData] = useState<Map<string, FileEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const loadDir = useCallback(async (path: string): Promise<void> => {
    if (dirCache.has(path)) {
      setDirData((prev) => new Map(prev).set(path, dirCache.get(path)!));
      return;
    }
    try {
      const { getEnv } = await import("@my-agent/core");
      const entries = sortEntries(await getEnv().fs.readdir(path));
      dirCache.set(path, entries);
      setDirData((prev) => new Map(prev).set(path, entries));
    } catch {
      dirCache.set(path, []);
      setDirData((prev) => new Map(prev).set(path, []));
    }
  }, []);

  const toggleDir = useCallback(
    async (path: string): Promise<void> => {
      if (expanded.has(path)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }
      await loadDir(path);
      setExpanded((prev) => new Set(prev).add(path));
    },
    [expanded, loadDir]
  );

  const reload = useCallback(() => {
    clearDirCache();
    setDirData(new Map());
    setExpanded(new Set());
    setReloadToken((token) => token + 1);
  }, []);

  /**
   * Expand the ancestor directory chain of `path` (loading each dir) so the
   * target file becomes part of the flat tree. Used to auto-reveal a file that
   * was selected in diff mode after switching to the full-tree view, and to
   * jump `[`/`]` to a changed file whose directory is currently collapsed.
   */
  const revealPath = useCallback(
    async (path: string) => {
      if (!rootPath) return;
      const rel = workspaceRelativePath(rootPath, path);
      if (!rel || rel === ".") return;
      const parts = rel.split("/");
      const dirs: string[] = [rootPath];
      let cur = rootPath;
      for (let i = 0; i < parts.length - 1; i++) {
        cur = joinWorkspacePath(cur, parts[i]!);
        dirs.push(cur);
      }
      await Promise.all(dirs.map((dir) => loadDir(dir)));
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const dir of dirs) next.add(dir);
        return next;
      });
    },
    [rootPath, loadDir]
  );

  useEffect(() => {
    if (!rootPath) return;
    let cancelled = false;
    setLoading(true);
    loadDir(rootPath).then(() => {
      if (cancelled) return;
      setExpanded(new Set([rootPath]));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rootPath, reloadToken, loadDir]);

  const items = useMemo(() => {
    const result: FlatTreeItem[] = [];

    function buildFlat(dirPath: string, indent: number): void {
      const entries = dirData.get(dirPath);
      if (!entries) return;
      for (const entry of entries) {
        const fullPath = joinWorkspacePath(dirPath, entry.name);
        if (entry.type === "directory") {
          const isExpanded = expanded.has(fullPath);
          result.push({ path: fullPath, name: entry.name, indent, type: "directory", expanded: isExpanded });
          if (isExpanded) buildFlat(fullPath, indent + 1);
        } else {
          result.push({ path: fullPath, name: entry.name, indent, type: "file", expanded: false });
        }
      }
    }

    if (rootPath && dirData.has(rootPath)) {
      buildFlat(rootPath, 0);
    }

    return result;
  }, [dirData, expanded, rootPath]);

  return { items, loading, toggleDir, reload, revealPath };
}

// ============================================================================
// useDiffFileTree (diff mode: only changed files, merged prefixes)
// ============================================================================

/**
 * Diff-mode tree: rows are built purely from the git status map (no fs reads),
 * so the sidebar lists only changed files. Directory chains with a single
 * subdirectory are merged into one row (GitHub PR style); all directories start
 * expanded and can be collapsed via `toggleDir`.
 */
export function useDiffFileTree(
  gitStatus: Map<string, string>,
  rootPath: string
): {
  items: FlatTreeItem[];
  toggleDir: (path: string) => void;
} {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const items = useMemo(() => buildDiffTreeItems(gitStatus, rootPath, collapsed), [gitStatus, rootPath, collapsed]);

  const toggleDir = useCallback(
    (path: string) => {
      const key = workspaceRelativePath(rootPath, path);
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [rootPath]
  );

  return { items, toggleDir };
}

// ============================================================================
// FileTree
// ============================================================================

interface FileTreeProps {
  items: FlatTreeItem[];
  gitStatus: Map<string, string>;
  dirStatuses: Map<string, DirStatusSummary>;
  rootPath: string;
  cursorIndex: number;
  selectedPath: string | null;
  scrollTop: number;
  visibleCount: number;
  loading: boolean;
  /** Shown instead of "(empty directory)" when the item list is empty. */
  emptyLabel?: string;
  /** Per-file +/− line counts vs HEAD (GitHub PR style labels). */
  diffStats?: Map<string, WorkspaceFileDiffStat> | null;
}

export const FileTree = ({
  items,
  gitStatus,
  dirStatuses,
  rootPath,
  cursorIndex,
  selectedPath,
  scrollTop,
  visibleCount,
  loading,
  emptyLabel,
  diffStats,
}: FileTreeProps) => {
  if (loading) return <Text color={COLORS.muted}>Loading tree...</Text>;
  if (items.length === 0)
    return (
      <Text color={COLORS.muted} dimColor>
        {emptyLabel ?? "(empty directory)"}
      </Text>
    );

  const windowItems = items.slice(scrollTop, scrollTop + visibleCount);

  return (
    <Box flexDirection="column">
      {windowItems.map((item, offset) => {
        const index = scrollTop + offset;
        const isCursor = index === cursorIndex;
        const isSelected = item.type === "file" && selectedPath === item.path;
        const rowBg = isCursor ? BG.rowCursor : isSelected ? BG.rowSelected : undefined;
        const status = lookupGitStatus(gitStatus, rootPath, item.path);
        const style = status ? getStatusStyle(status) : null;
        const indent = "  ".repeat(item.indent);
        const rowColor = isCursor || isSelected ? COLORS.text : COLORS.muted;

        if (item.type === "directory") {
          const folderIcon = getFolderIconStyle(item.expanded, item.name);
          const dirSummary = dirStatuses.get(item.path);
          const dirLabel = formatDirStatus(dirSummary);
          return (
            <Box key={item.path} flexShrink={0} height={1} width="100%" backgroundColor={rowBg}>
              <Text wrap="truncate">
                {indent}
                <Text color={rowColor}>{folderIcon.chevron}</Text>
                <Text color={folderIcon.color}>{formatFolderGlyph(folderIcon)}</Text>
                <Text color={rowColor}>{item.name}/</Text>
                {dirLabel && (
                  <Text color={COLORS.warning} bold>
                    {" "}
                    [{dirLabel}]
                  </Text>
                )}
              </Text>
            </Box>
          );
        }

        const icon = getFileIconStyle(item.path);
        const stats = diffStats?.get(workspaceRelativePath(rootPath, item.path));
        return (
          <Box key={item.path} flexShrink={0} height={1} width="100%" backgroundColor={rowBg}>
            <Text wrap="truncate">
              {indent}
              <Text color={icon.color}>{formatIconGlyph(icon)}</Text>
              <Text color={rowColor}>{item.name}</Text>
              {style && (
                <Text color={style.color} bold>
                  {" "}
                  {style.label}
                </Text>
              )}
              {stats && (stats.added > 0 || stats.deleted > 0) && (
                <>
                  <Text color={COLORS.success}> +{stats.added}</Text>
                  <Text color={COLORS.danger}>−{stats.deleted}</Text>
                </>
              )}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
