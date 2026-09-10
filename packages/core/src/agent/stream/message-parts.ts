/**
 * Shared UIMessage part predicates.
 *
 * These guards were previously duplicated across the stream / approval / subagent
 * modules (4× `isToolCallPart`, 2× `partTextContent`). Keep them here so the
 * "what counts as a text/tool-call part" definition lives in one place.
 */

import type { ToolCallPart } from "@tanstack/ai";

/** Text of a `text` part; `""` for any other part type or non-string content. */
export function partTextContent(part: { type?: string; content?: unknown }): string {
  if (part.type !== "text") return "";
  return typeof part.content === "string" ? part.content : "";
}

/** Narrow a UI message part to a tool-call part. */
export function isToolCallPart(part: { type?: string }): part is ToolCallPart {
  return part.type === "tool-call";
}
