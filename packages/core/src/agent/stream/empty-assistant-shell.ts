import { partTextContent } from "./message-parts.js";

import type { UIMessage } from "@tanstack/ai";

const MEANINGFUL_ASSISTANT_PART_TYPES = new Set([
  "tool-call",
  "tool-result",
  "thinking",
  "structured-output",
  "ui-resource",
]);

/**
 * TanStack {@link StreamProcessor} may create an assistant UIMessage on
 * `TEXT_MESSAGE_START` before any content arrives. When the model returns an
 * empty `stop`, that shell remains as `parts: []` and breaks tool-phase detection.
 */
export function isEmptyAssistantShell(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;

  if (message.parts.length === 0) return true;

  return message.parts.every((part) => {
    if (MEANINGFUL_ASSISTANT_PART_TYPES.has(part.type)) return false;
    if (part.type === "text") return partTextContent(part).trim().length === 0;
    return true;
  });
}

/** Drop trailing empty assistant shells from a conversation snapshot. */
export function stripEmptyAssistantShells(messages: UIMessage[]): UIMessage[] {
  let end = messages.length;
  while (end > 0 && isEmptyAssistantShell(messages[end - 1]!)) {
    end--;
  }
  return end === messages.length ? messages : messages.slice(0, end);
}

/** Last assistant message that carries tool calls, text, thinking, etc. */
export function findLastMeaningfulAssistant(messages: UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "assistant" && !isEmptyAssistantShell(message)) {
      return message;
    }
  }
  return undefined;
}
