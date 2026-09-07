/**
 * Message splitter — chunks text to a platform's per-message limit without
 * breaking fenced code blocks: a chunk that would end inside a fence is closed
 * and the next chunk reopens it.
 */

const FENCE_PATTERN = /^\s*(```|~~~)/;
const DEFAULT_FENCE = "```";

export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  if (maxLength < 2 * DEFAULT_FENCE.length + 1) return hardWrap(text, maxLength);

  const chunks: string[] = [];
  let current = "";
  let openFence: string | null = null;

  for (const line of text.split("\n")) {
    // A single line longer than the limit can't respect fences — hard-wrap it.
    if (line.length > maxLength) {
      if (current.trim().length > 0) {
        chunks.push(openFence ? `${current}\n${DEFAULT_FENCE}` : current);
        current = openFence ? DEFAULT_FENCE : "";
      }
      for (const piece of hardWrap(line, maxLength)) chunks.push(piece);
      continue;
    }

    const projected = current.length === 0 ? line.length : current.length + 1 + line.length;
    if (projected > maxLength && current.trim().length > 0) {
      // Close an open fence so no chunk ends mid-block, then reopen in the next chunk.
      chunks.push(openFence ? `${current}\n${DEFAULT_FENCE}` : current);
      current = openFence ? DEFAULT_FENCE : "";
    }
    current = current.length === 0 ? line : `${current}\n${line}`;
    if (FENCE_PATTERN.test(line)) openFence = openFence === null ? DEFAULT_FENCE : null;
  }

  if (current.trim().length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : hardWrap(text, maxLength);
}

function hardWrap(text: string, maxLength: number): string[] {
  const pieces: string[] = [];
  for (let offset = 0; offset < text.length; offset += maxLength) {
    pieces.push(text.slice(offset, offset + maxLength));
  }
  return pieces;
}
