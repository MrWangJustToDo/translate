/**
 * Media utilities — dehydrate/hydrate UIMessage content parts for session persistence.
 *
 * **Dehydrate** (save): extract base64 data from ImagePart/AudioPart/VideoPart/DocumentPart
 * `source.value`, store as content-addressed files via {@link MediaStore}, and replace
 * `source.value` with a `media://<hash>` reference.
 *
 * **Hydrate** (load): reverse the process — read the file back and reconstruct the
 * original `source.value` (data URL or raw base64, matching the original shape).
 *
 * ## Rules
 * 1. **Always clone first** — never mutate the original UIMessage[] in place.
 * 2. **Both source types** — `source.type: "url"` (data URL prefix) and
 *    `source.type: "data"` (raw base64) are handled.
 * 3. **Scope** — only ImagePart/AudioPart/VideoPart/DocumentPart `source.value`.
 *    Tool output parts with nested base64 fields (non-ContentPart) are NOT processed.
 * 4. **Inline runtime values** — parts without `metadata.mediaRef` that still
 *    carry a data URL / raw base64 (or `media://` path) are left or resolved
 *    as appropriate; dehydrated sessions always carry `mediaRef`.
 */

import { getMediaStore } from "./media-store.js";
import { repairStringifiedMultimodalUIMessages } from "./repair-stringified-multimodal.js";
import { MEDIA_PROTOCOL, buildMediaRefPath, parseMediaRefPath } from "./types.js";

import type { MediaRef } from "./types.js";
import type { AudioPart, DocumentPart, ImagePart, UIMessage, VideoPart } from "@tanstack/ai";

// ============================================================================
// Session media metadata (extends TanStack part metadata)
// ============================================================================

/** Metadata fields we read/write on binary media parts during session persist. */
export interface SessionMediaMetadata {
  mediaType?: string;
  filename?: string;
  imageIndex?: number;
  mediaRef?: MediaRef;
}

type BinaryMediaPart =
  | ImagePart<SessionMediaMetadata>
  | AudioPart<SessionMediaMetadata>
  | VideoPart<SessionMediaMetadata>
  | DocumentPart<SessionMediaMetadata>;

function isBinaryMediaPart(part: UIMessage["parts"][number]): part is BinaryMediaPart {
  return part.type === "image" || part.type === "audio" || part.type === "video" || part.type === "document";
}

function ensureMetadata(part: BinaryMediaPart): SessionMediaMetadata {
  if (part.metadata == null || typeof part.metadata !== "object") {
    part.metadata = {};
  }
  return part.metadata;
}

/**
 * Check if a source value contains base64-encoded data.
 */
function isBase64Source(value: string): boolean {
  // Data URL with base64: data:{mimeType};base64,...
  if (/^data:[^;]+;base64,/s.test(value)) return true;
  // Raw base64 — must be non-empty and reasonably long (at least 20 chars to
  // avoid false positives on short metadata strings, and only base64 chars).
  if (value.length < 20) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value);
}

// ============================================================================
// Deep Clone
// ============================================================================

/**
 * Deep-clone a UIMessage array so we never mutate the original.
 * Uses JSON.parse/stringify which handles the serializable subset of
 * UIMessage (all fields are plain data — no functions, symbols, etc.).
 */
function cloneMessages(messages: UIMessage[]): UIMessage[] {
  return JSON.parse(JSON.stringify(messages)) as UIMessage[];
}

// ============================================================================
// Dehydrate
// ============================================================================

/**
 * Dehydrate UIMessages: extract base64 binary assets to MediaStore and
 * replace `source.value` with `media://<hash>` references.
 *
 * @param messages - Original UIMessage[] (NOT mutated)
 * @returns A new UIMessage[] with dehydrated source values
 */
export async function dehydrateUIMessages(messages: UIMessage[]): Promise<UIMessage[]> {
  const store = getMediaStore();
  // Repair interrupt-snapshot corruption before extracting media (legacy sessions).
  const cloned = cloneMessages(repairStringifiedMultimodalUIMessages(messages));

  for (const message of cloned) {
    for (const part of message.parts) {
      if (!isBinaryMediaPart(part)) continue;

      const { source } = part;
      const value = source.value;
      if (!value || !isBase64Source(value)) continue;

      const mimeType = source.mimeType ?? guessMimeType(value, part.type);
      const metadata = ensureMetadata(part);
      const filename = metadata.filename;
      const sourceType = source.type === "data" ? "data" : "url";

      const ref = await store.save(value, mimeType, filename, sourceType);
      source.value = buildMediaRefPath(ref);
      metadata.mediaRef = {
        hash: ref.hash,
        mimeType: ref.mimeType,
        filename: ref.filename,
        size: ref.size,
        sourceType: ref.sourceType,
      };
    }
  }

  return cloned;
}

// ============================================================================
// Hydrate
// ============================================================================

function isMediaRefValue(value: string): boolean {
  return value.startsWith(MEDIA_PROTOCOL);
}

/**
 * Hydrate UIMessages: load binary assets from MediaStore and reconstruct
 * the original `source.value` (data URL or raw base64).
 *
 * @param messages - Dehydrated UIMessage[] (may contain `media://` refs)
 * @returns A new UIMessage[] with fully hydrated source values
 */
export async function hydrateUIMessages(messages: UIMessage[]): Promise<UIMessage[]> {
  const store = getMediaStore();
  // Restore multimodal parts that were persisted as JSON.stringify(ContentPart[]).
  const cloned = cloneMessages(repairStringifiedMultimodalUIMessages(messages));

  for (const message of cloned) {
    // JSON persistence turns the Date-typed `createdAt` into an ISO string;
    // TanStack's wire conversion calls `createdAt.toISOString()` and would
    // crash on the string form.
    //
    // NOTE (upstream fixed): @tanstack/ai >= 0.53.0 `coerceCreatedAt`
    // (activities/chat/messages.js) accepts string timestamps, so new engine
    // output survives wire conversion without this revive. Kept to normalize
    // legacy persisted sessions that still store ISO strings.
    if (typeof message.createdAt === "string") {
      const revived = new Date(message.createdAt);
      if (!Number.isNaN(revived.getTime())) message.createdAt = revived;
    }
    for (const part of message.parts) {
      if (!isBinaryMediaPart(part)) continue;

      const metadata = part.metadata;
      const mediaRef = metadata?.mediaRef;

      if (!mediaRef) {
        // Old session — no mediaRef. Check if source.value is a media:// ref
        // (might happen if hydrating an already-dehydrated session).
        const { source } = part;
        if (!isMediaRefValue(source.value)) continue;

        const mimeType = metadata?.mediaType ?? guessMimeTypeFromRef(source.value, part.type);
        const filename = metadata?.filename;
        const sourceType = source.type === "data" ? "data" : "url";
        const parsed = parseMediaRefPath(source.value);
        if (!parsed) continue;

        const loaded = await store.tryLoad({
          hash: parsed.hash,
          mimeType,
          filename,
          size: 0,
          sourceType,
        });
        if (loaded) {
          source.value = loaded;
        }
        continue;
      }

      const loaded = await store.tryLoad(mediaRef);
      if (!loaded) continue;

      part.source.value = loaded;
      if (metadata) {
        delete metadata.mediaRef;
      }
    }
  }

  return cloned;
}

// ============================================================================
// Helpers (MIME type only — ext/parse live in types.ts)
// ============================================================================

/** Guess MIME type from a data URL or raw base64 content. */
function guessMimeType(value: string, partType: string): string {
  const match = value.match(/^data:([^;]+);base64,/);
  if (match) return match[1];

  const mimeDefaults: Record<string, string> = {
    image: "image/png",
    audio: "audio/mpeg",
    video: "video/mp4",
    document: "application/pdf",
  };
  return mimeDefaults[partType] ?? "application/octet-stream";
}

/** Guess MIME type from a media:// ref string. */
function guessMimeTypeFromRef(ref: string, partType: string): string {
  const parsed = parseMediaRefPath(ref);
  if (parsed) {
    const extMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      bmp: "image/bmp",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      pdf: "application/pdf",
      mp4: "video/mp4",
      webm: "video/webm",
    };
    if (extMap[parsed.ext]) return extMap[parsed.ext];
  }
  const mimeDefaults: Record<string, string> = {
    image: "image/png",
    audio: "audio/mpeg",
    video: "video/mp4",
    document: "application/pdf",
  };
  return mimeDefaults[partType] ?? "application/octet-stream";
}
