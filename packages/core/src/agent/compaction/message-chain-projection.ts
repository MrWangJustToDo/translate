/**
 * Chronological UIMessage/ModelMessage chain → summary-first LLM wire projection.
 *
 * Durable channel order stays chronological (`[…kept…][SUMMARY][…newer…]`).
 * Wire order for the model is `[SUMMARY, …kept…, …newer…]`. Never write the
 * projected array back into the channel.
 */

import { generateId } from "../../utils/generate-id.js";

import { formatCompactionSummaryContent, isCompactionSummaryModelMessage } from "./compaction-summary.js";
import { findCutPoint, findCutPointByBudget } from "./cut-point.js";

import type { ModelMessage, UIMessage } from "@tanstack/ai";

export {
  CONVERSATION_SUMMARY_END,
  CONVERSATION_SUMMARY_START,
  formatCompactionSummaryContent,
  isCompactionSummaryModelMessage,
  isCompactionSummaryText,
  isCompactionSummaryUIMessage,
  isLatestDurableMessageCompactionSummary,
} from "./compaction-summary.js";

/** Index of the latest in-chain compaction summary, or -1. */
export function findLatestSummaryIndex(messages: ModelMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isCompactionSummaryModelMessage(messages[i]!)) return i;
  }
  return -1;
}

/** Build a UIMessage checkpoint for appending onto the channel. */
export function createCompactionSummaryUIMessage(summary: string, id?: string): UIMessage {
  return {
    id: id ?? generateId("compact"),
    role: "user",
    parts: [{ type: "text", content: formatCompactionSummaryContent(summary) }],
  };
}

export interface GetModelVisibleMessagesOptions {
  /**
   * @deprecated Legacy fallback: recent real user turns to keep before the
   * latest summary (default: 2). Prefer `keepRecentTokens` — the default path
   * (token-budget derivation).
   */
  keepRecentFlows?: number;
  /**
   * Token budget for the kept window. When set, the kept window is derived by
   * a pairing-safe token walk instead of counting user turns.
   */
  keepRecentTokens?: number;
}

/**
 * Project a chronological model-message chain to summary-first wire order.
 *
 * - No summary → identity
 * - With summary → `[summary, …kept before summary…, …after summary…]`
 */
export function getModelVisibleMessages(
  messages: ModelMessage[],
  options: GetModelVisibleMessagesOptions = {}
): ModelMessage[] {
  const { keepRecentFlows = 2, keepRecentTokens } = options;
  const summaryIdx = findLatestSummaryIndex(messages);
  if (summaryIdx < 0) {
    return messages;
  }

  const summary = messages[summaryIdx]!;
  const before = messages.slice(0, summaryIdx);
  const after = messages.slice(summaryIdx + 1);
  // Deterministic over the frozen pre-summary slice: same content + policy
  // always yields the same kept window (see design notes in keep-policy.ts).
  const keptStart =
    keepRecentTokens != null
      ? findCutPointByBudget(before, keepRecentTokens).cutIndex
      : findCutPoint(before, keepRecentFlows);
  const kept = before.slice(keptStart);
  return [summary, ...kept, ...after];
}
