import type { Attachment } from "../types/attachment.js";

/**
 * Unicode Private Use Area characters for image placeholders.
 * Each image gets a unique character so images behave like single input characters.
 */
export const IMAGE_PLACEHOLDER_START = 0xe000;
export const IMAGE_PLACEHOLDER_END = 0xe0ff;

/** Stable ref embedded in submitted text for LLM + UI composition. Example: `[Image #1: clipboard-a1b2c3d4.png]` */
export const IMAGE_REF_RE = /\[Image #(\d+): ([^\]]+)\]/g;

/** Check if a character is an image placeholder. */
export function isImagePlaceholder(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= IMAGE_PLACEHOLDER_START && code <= IMAGE_PLACEHOLDER_END;
}

/** Get the image index from a placeholder character. */
export function getImageIndex(char: string): number {
  return char.charCodeAt(0) - IMAGE_PLACEHOLDER_START;
}

/** Create a placeholder character for an image index. */
export function createImagePlaceholder(index: number): string {
  return String.fromCharCode(IMAGE_PLACEHOLDER_START + index);
}

/** Format a stable image ref for submitted text / history. */
export function formatImageRef(displayIndex: number, filename: string): string {
  return `[Image #${displayIndex}: ${filename}]`;
}

/**
 * Unicode Private Use Area characters for large-paste placeholders.
 * Distinct range from image placeholders so a paste behaves like a single
 * input character while staying unambiguous.
 */
export const PASTE_PLACEHOLDER_START = 0xe100;
export const PASTE_PLACEHOLDER_END = 0xe1ff;

/** Large-paste collapse thresholds (mirror gemini-cli). */
export const LARGE_PASTE_LINE_THRESHOLD = 5;
export const LARGE_PASTE_CHAR_THRESHOLD = 500;

/**
 * Max gap (ms) between consecutive `paste` events to treat them as chunks of a
 * single paste. react-terminal forwards each stdin chunk as a separate input
 * event, so one large bracketed paste can arrive split across several events;
 * chunks that land right after a placeholder we just created within this window
 * are merged back into that placeholder instead of becoming extra placeholders
 * or stray text.
 */
export const PASTE_MERGE_WINDOW_MS = 200;

/** A collapsed large paste: full text + line count for the display label. */
export interface PendingPaste {
  text: string;
  lineCount: number;
}

/** Check if a character is a large-paste placeholder. */
export function isPastePlaceholder(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= PASTE_PLACEHOLDER_START && code <= PASTE_PLACEHOLDER_END;
}

/** Get the paste index from a placeholder character. */
export function getPasteIndex(char: string): number {
  return char.charCodeAt(0) - PASTE_PLACEHOLDER_START;
}

/** Create a placeholder character for a paste index. */
export function createPastePlaceholder(index: number): string {
  return String.fromCharCode(PASTE_PLACEHOLDER_START + index);
}

/** True when pasted text is large enough to collapse into a placeholder. */
export function isLargePaste(text: string): boolean {
  return text.split("\n").length > LARGE_PASTE_LINE_THRESHOLD || text.length > LARGE_PASTE_CHAR_THRESHOLD;
}

/** Display label for a collapsed paste placeholder. */
export function formatPastePlaceholder(lineCount: number): string {
  return `[Pasted Text: ${lineCount} lines]`;
}

/** Remove the paste entry at an index from a sparse pendingPastes array. */
export function removePasteAtIndex(
  pendingPastes: (PendingPaste | undefined)[],
  pasteIndex: number
): (PendingPaste | undefined)[] {
  return pendingPastes.map((paste, index) => (index === pasteIndex ? undefined : paste));
}

export function removeAttachmentAtIndex(attachments: Attachment[], imageIndex: number): Attachment[] {
  return attachments
    .map((attachment, index) => (index === imageIndex ? null : attachment))
    .filter(Boolean) as Attachment[];
}

/**
 * Convert input value + sparse attachments into submitted text (with image refs)
 * and attachments ordered by placeholder appearance. Large-paste placeholders are
 * expanded back to their real content on submit (mirrors gemini-cli
 * expandPastePlaceholders).
 */
export function extractSubmittedInput(
  rawValue: string,
  attachments: Attachment[],
  pendingPastes?: (PendingPaste | undefined)[]
): { text: string; attachments: Attachment[] } {
  let text = "";
  const orderedAttachments: Attachment[] = [];
  let displayNum = 1;

  for (const char of rawValue) {
    if (isImagePlaceholder(char)) {
      const attachment = attachments[getImageIndex(char)];
      if (attachment) {
        text += formatImageRef(displayNum, attachment.filename);
        orderedAttachments.push(attachment);
        displayNum++;
      }
    } else if (isPastePlaceholder(char)) {
      const paste = pendingPastes?.[getPasteIndex(char)];
      if (paste) {
        text += paste.text;
      }
    } else {
      text += char;
    }
  }

  return { text: text.trim(), attachments: orderedAttachments };
}

export function appendHistoryEntry(history: string[], text: string): string[] {
  if (!text || history[history.length - 1] === text) {
    return history;
  }
  return [...history, text];
}

export function hasImagePlaceholder(value: string): boolean {
  for (const char of value) {
    if (isImagePlaceholder(char)) {
      return true;
    }
  }
  return false;
}
