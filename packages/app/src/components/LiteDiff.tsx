import { Box, Text } from "ink";
import { memo, useMemo } from "react";

import { BG, COLORS } from "../theme/colors.js";
import { syntaxColorForClasses } from "../theme/syntax-colors.js";
import { highlightLine, langForPath, type LiteDiffSegment } from "../utils/lite-diff-highlight.js";
import { createLiteDiff, type LiteDiffRow } from "../utils/lite-diff.js";

/**
 * Cheap diff renderer for message-view previews.
 *
 * Unlike {@link FileDiffContent} (full `@git-diff-view` Split/Unified views for
 * the interactive workspace), this renders only the changed hunks of a unified
 * patch with per-line highlight and a FIFO segment cache — O(hunk) instead of
 * O(file), and free on re-render when content is unchanged.
 */
export type LiteDiffProps = {
  oldPath: string;
  newPath: string;
  oldFile: string;
  newFile: string;
  width: number;
  /** Max rendered rows before tail truncation (default 60). */
  maxLines?: number;
  /** 1-based line offset for fragment diffs (prepends virtual empty lines). */
  startLine?: number;
};

function padNum(value: number | undefined, width: number): string {
  if (value === undefined) return " ".repeat(width);
  return String(value).padStart(width, " ");
}

function rowBackground(type: LiteDiffRow["type"]): string | undefined {
  if (type === "add") return BG.diffAdded;
  if (type === "del") return BG.diffRemoved;
  return undefined;
}

function rowMarker(type: LiteDiffRow["type"]): string {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
}

export const LiteDiff = memo(function LiteDiff({
  oldPath,
  newPath,
  oldFile,
  newFile,
  width,
  maxLines = 60,
  startLine,
}: LiteDiffProps) {
  const paddedOld = startLine && startLine > 1 ? "\n".repeat(startLine - 1) + oldFile : oldFile;
  const paddedNew = startLine && startLine > 1 ? "\n".repeat(startLine - 1) + newFile : newFile;

  const result = useMemo(() => createLiteDiff(paddedOld, paddedNew, { maxLines }), [paddedOld, paddedNew, maxLines]);

  const lang = useMemo(() => langForPath(newPath || oldPath), [newPath, oldPath]);

  const rows = result.rows;
  const maxOld = rows.reduce((acc, r) => Math.max(acc, r.oldLine ?? 0), 0);
  const maxNew = rows.reduce((acc, r) => Math.max(acc, r.newLine ?? 0), 0);
  const numWidth = Math.max(3, String(Math.max(maxOld, maxNew)).length);
  const gutterWidth = numWidth * 2 + 4; // "nnnn nnnn m " (m = +/- marker)
  const contentWidth = Math.max(10, width - gutterWidth);

  if (rows.length === 0) {
    return <Text color={COLORS.muted}>{oldFile === "" && newFile === "" ? "empty file" : "no changes"}</Text>;
  }

  return (
    <Box flexDirection="column" flexShrink={0} width={width}>
      {rows.map((row, i) => {
        if (row.type === "gap") {
          return (
            <Text key={`gap-${i}`} color={COLORS.muted} dimColor>
              {`${"·".repeat(3)}${" ".repeat(Math.max(0, gutterWidth - 3))}⋯`}
            </Text>
          );
        }
        const bg = rowBackground(row.type);
        const marker = rowMarker(row.type);
        const rawText = row.text;
        const segments = highlightLine(rawText, lang);
        const plain = rawText.slice(0, contentWidth);
        let shownLength = plain.length;
        const clipped: LiteDiffSegment[] = [];
        if (segments) {
          let used = 0;
          for (const seg of segments) {
            const remaining = contentWidth - used;
            if (remaining <= 0) break;
            const text = seg.text.slice(0, remaining);
            used += text.length;
            clipped.push({ ...seg, text });
          }
          shownLength = used;
        }
        // Pad to the full row width so the add/del background spans edge to edge.
        const fill = " ".repeat(Math.max(0, width - gutterWidth - shownLength));
        return (
          <Text key={i} backgroundColor={bg}>
            <Text color={COLORS.muted} dimColor>
              {`${padNum(row.oldLine, numWidth)} ${padNum(row.newLine, numWidth)} ${marker} `}
            </Text>
            {segments ? (
              clipped.map((seg, si) =>
                seg.text ? (
                  <Text key={si} color={syntaxColorForClasses(seg.classes)}>
                    {seg.text}
                  </Text>
                ) : null
              )
            ) : (
              <Text color={COLORS.text}>{plain}</Text>
            )}
            {fill}
          </Text>
        );
      })}
      {result.hidden > 0 && (
        <Text color={COLORS.muted} dimColor>
          {`⋯ ${result.hidden} more line${result.hidden === 1 ? "" : "s"}`}
        </Text>
      )}
    </Box>
  );
});
