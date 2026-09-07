/**
 * Drop text chunks that reference an assistant message which existed BEFORE the
 * current run started. TanStack >= 0.53 StreamProcessor gained
 * `resumeAssistantState`: a late chunk carrying a historical `messageId`
 * re-opens the completed message (`isComplete = false`, re-added to the active
 * set) and appends to it. Late chunks after abort / finalize are exactly that
 * shape, so without this guard a stale TEXT delta resurrects an old assistant
 * row and grows it unboundedly.
 *
 * The predicate is a per-run snapshot of historical message ids (taken by
 * AgentUIChannel right after `prepareAssistantMessage()`), NOT membership in
 * the live `messages` array. Within a run the first TEXT chunk materializes
 * its message immediately, so "exists in messages" would also match every
 * legitimate delta of the active message and suppress the whole stream.
 *
 * Legitimate flows never reuse a historical id: every `chat()` iteration and
 * every recovery run (max-tokens continue, stream retry, approval second call)
 * generates a fresh `messageId` via `generateMessageId()`. A chunk whose id is
 * in the historical snapshot is either a replay of already rendered content or
 * a late chunk — both must be suppressed.
 */

import type { StreamChunk } from "@tanstack/ai";

/** Chunk types that reference a message id and can reopen its state. */
const TEXT_CHUNK_TYPES = new Set(["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"]);

function readMessageId(chunk: StreamChunk): string | undefined {
  if (!TEXT_CHUNK_TYPES.has(chunk.type)) return undefined;
  const record = chunk as { messageId?: unknown };
  return typeof record.messageId === "string" && record.messageId.length > 0 ? record.messageId : undefined;
}

/**
 * Whether this text chunk targets a message from before the current run
 * (historical snapshot) and would therefore resurrect a completed row.
 */
export function shouldSuppressStaleTextChunk(historicalMessageIds: ReadonlySet<string>, chunk: StreamChunk): boolean {
  const messageId = readMessageId(chunk);
  if (!messageId) return false;
  return historicalMessageIds.has(messageId);
}
