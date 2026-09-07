/**
 * Drop text chunks that reference an assistant message which already exists in
 * the channel. TanStack >= 0.53 StreamProcessor gained `resumeAssistantState`:
 * a late chunk carrying a historical `messageId` re-opens the completed message
 * (`isComplete = false`, re-added to the active set) and appends to it. Late
 * chunks after abort / finalize are exactly that shape, so without this guard a
 * stale TEXT delta resurrects an old assistant row and grows it unboundedly.
 *
 * Legitimate flows never reuse an existing id: every `chat()` iteration and
 * every recovery run (max-tokens continue, stream retry, approval second call)
 * generates a fresh `messageId` via `generateMessageId()`. So a text chunk
 * whose id matches a materialized message is either a replay of already
 * rendered content or a late chunk — both must be suppressed.
 */

import type { StreamChunk, UIMessage } from "@tanstack/ai";

/** Chunk types that reference a message id and can reopen its state. */
const TEXT_CHUNK_TYPES = new Set(["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"]);

function readMessageId(chunk: StreamChunk): string | undefined {
  if (!TEXT_CHUNK_TYPES.has(chunk.type)) return undefined;
  const record = chunk as { messageId?: unknown };
  return typeof record.messageId === "string" && record.messageId.length > 0 ? record.messageId : undefined;
}

/** Whether this text chunk targets an assistant message that already exists. */
export function shouldSuppressStaleTextChunk(messages: UIMessage[], chunk: StreamChunk): boolean {
  const messageId = readMessageId(chunk);
  if (!messageId) return false;
  return messages.some((message) => message.id === messageId);
}
