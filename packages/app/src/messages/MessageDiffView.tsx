import { memo, useMemo } from "react";

import { EditDiff } from "../components/EditDiff.js";
import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { LiteDiff } from "../components/LiteDiff.js";
import { useDiffRenderer } from "../hooks/use-diff-renderer.js";
import { BG } from "../theme/colors.js";

export type MessageDiffViewProps = {
  width: number;
  oldPath: string;
  newPath: string;
  oldFile: string;
  newFile: string;
  /** 1-based line offset for fragment diffs (per-edit oldString→newString previews). */
  startLine?: number;
  /** Max rendered rows before tail truncation (LiteDiff only). */
  maxLines?: number;
};

/** Cheap content hash for the legacy renderer's diff-file cache key. */
function hashContent(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * In-message diff preview. Renderer is runtime-selectable via `/appearance`
 * (defaults to LiteDiff — hunk-only unified diff with cached per-line
 * highlight; "full" restores the wrapping `@git-diff-view` renderer). The
 * rich interactive `@git-diff-view` view remains workspace-only
 * (FileDiffContent / FileContent).
 */
export const MessageDiffView = memo(function MessageDiffView({
  width,
  oldPath,
  newPath,
  oldFile,
  newFile,
  startLine,
  maxLines,
}: MessageDiffViewProps) {
  const diffId = useMemo(
    () => `${oldPath}\0${newPath}\0${hashContent(oldFile)}\0${hashContent(newFile)}`,
    [oldPath, newPath, oldFile, newFile]
  );

  const full = useDiffRenderer((s) => s.mode === "full");

  if (full) {
    return (
      <HalfLinePaddedBox backgroundColor={BG.toolResult} transparentBody width={width}>
        <EditDiff
          id={diffId}
          width={width}
          oldPath={oldPath}
          oldFile={oldFile}
          newPath={newPath}
          newFile={newFile}
          {...(startLine !== undefined ? { startLine } : {})}
        />
      </HalfLinePaddedBox>
    );
  }

  return (
    <HalfLinePaddedBox backgroundColor={BG.toolResult} transparentBody width={width}>
      <LiteDiff
        width={width}
        oldPath={oldPath}
        oldFile={oldFile}
        newPath={newPath}
        newFile={newFile}
        {...(startLine !== undefined ? { startLine } : {})}
        {...(maxLines !== undefined ? { maxLines } : {})}
      />
    </HalfLinePaddedBox>
  );
});
