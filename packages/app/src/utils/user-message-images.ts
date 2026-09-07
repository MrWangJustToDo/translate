import { IMAGE_REF_RE } from "./user-input-helpers.js";

export type UserMessageSegment =
  { type: "text"; content: string } | { type: "image"; displayIndex: number; filename: string };

/**
 * Split submitted user text into plain text and `[Image #N: filename]` segments for inline UI.
 */
export function parseUserMessageSegments(text: string): UserMessageSegment[] {
  const segments: UserMessageSegment[] = [];
  const re = new RegExp(IMAGE_REF_RE.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: "image",
      displayIndex: Number.parseInt(match[1]!, 10),
      filename: match[2]!.trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

/** Compact chip label matching MultiLineInput (`[Image #N]`). */
export function formatImageChipLabel(displayIndex: number): string {
  return `[Image #${displayIndex}]`;
}
