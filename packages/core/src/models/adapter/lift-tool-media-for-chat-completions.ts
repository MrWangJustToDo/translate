/**
 * Chat Completions wire format only allows string `tool` content. Multimodal
 * ContentPart[] in tool results would be JSON.stringified (base64-as-text) and
 * never become `image_url` / `input_audio`. Rewrite: keep tool text as a string,
 * then inject a synthetic user message with image/audio parts (universal
 * OpenAI-compatible pattern).
 *
 * Anthropic / Responses keep native multimodal tool results — do not use here.
 *
 * Content may arrive either as a real ContentPart[] (after `applyToolCompact`
 * reshaped it via a tool's `toModelOutput`) or as the JSON text TanStack
 * persisted (`normalize-stream-chunk` stringifies array results). Both are
 * handled here, so subagents and legacy sessions do not leak base64 as text.
 */

import { isContentPartArray } from "@tanstack/ai";

import type { ContentPart, ModelMessage } from "@tanstack/ai";

const MEDIA_FOLLOW_UP_TEXT = "[Media from tool result — inspect the attached content.]";
const OMITTED_NON_IMAGE =
  "[Omitted non-image media: Chat Completions cannot embed this type on the wire. Prefer a provider with native multimodal tool results, or summarize in text.]";

function isLiftableMediaPart(part: ContentPart): part is Extract<ContentPart, { type: "image" | "audio" }> {
  return part.type === "image" || part.type === "audio";
}

/**
 * Resolve tool-message content to {@link ContentPart}[] when it carries media.
 *
 * TanStack persists array tool results as JSON text (`normalize-stream-chunk`
 * stringifies `TOOL_CALL_END.result`), so a multimodal result normally arrives
 * here as `'[{"type":"image",…}]'`. `applyToolCompact` repairs that for tools
 * with a registered `toModelOutput`, but subagents skip it — revive here too so
 * base64 never reaches the wire as plain text.
 */
function asToolContentParts(content: ModelMessage["content"]): ContentPart[] | null {
  if (isContentPartArray(content)) return content;

  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed.startsWith("[{")) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isContentPartArray(parsed)) return parsed;
    } catch {
      // Not JSON — plain text tool output.
    }
  }

  return null;
}

function splitToolContentParts(parts: ContentPart[]): { text: string; media: ContentPart[] } {
  const textChunks: string[] = [];
  const media: ContentPart[] = [];
  let omittedNonImage = false;

  for (const part of parts) {
    if (part.type === "text") {
      if (part.content) textChunks.push(part.content);
      continue;
    }
    if (isLiftableMediaPart(part)) {
      media.push(part);
      continue;
    }
    omittedNonImage = true;
  }

  // Only mention omission when there is no useful text (e.g. PDF extract already
  // carries content for Completions after document parts are dropped).
  if (omittedNonImage && textChunks.every((chunk) => !chunk.trim())) {
    textChunks.push(OMITTED_NON_IMAGE);
  }

  let text = textChunks.join("\n").trim();
  if (!text && media.length > 0) {
    text = "Media attached in the following user message.";
  }
  if (!text) {
    text = "";
  }

  return { text, media };
}

/**
 * Rewrite ModelMessages so Chat Completions adapters never stringify image/audio
 * base64 inside `role: "tool"`. Batches media from consecutive tool messages
 * into one trailing synthetic user message (avoids tool/user/tool interleaving).
 */
export function liftToolMediaForChatCompletions(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  let pendingMedia: ContentPart[] = [];

  const flushMedia = () => {
    if (pendingMedia.length === 0) return;
    out.push({
      role: "user",
      content: [{ type: "text", content: MEDIA_FOLLOW_UP_TEXT }, ...pendingMedia],
    });
    pendingMedia = [];
  };

  for (const message of messages) {
    const toolParts = message.role === "tool" ? asToolContentParts(message.content) : null;

    if (toolParts) {
      const { text, media } = splitToolContentParts(toolParts);
      out.push({
        ...message,
        content: text,
      });
      pendingMedia.push(...media);
      continue;
    }

    flushMedia();
    out.push(message);
  }

  flushMedia();
  return out;
}
