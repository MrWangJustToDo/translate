import { memo, useMemo } from "react";

import { EditDiff } from "../components/EditDiff.js";
import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { LiteDiff } from "../components/LiteDiff.js";
import { BG } from "../theme/colors.js";
import { USE_LITE_DIFF } from "../utils/diff-renderer-flag.js";

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
 * In-message diff preview. Defaults to LiteDiff (hunk-only unified diff with
 * cached per-line highlight); flip {@link USE_LITE_DIFF} to false to restore
 * the legacy `@git-diff-view` renderer. The rich interactive
 * `@git-diff-view` view remains workspace-only (FileDiffContent / FileContent).
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

  if (!USE_LITE_DIFF) {
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
