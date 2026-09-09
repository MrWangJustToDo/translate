/**
 * Token budget helpers for compaction summarization subagents.
 */

import { estimateTokens } from "./token-estimator.js";

import type { AgentManager } from "../../runtime-types/hosts.js";
import type { ModelMessage } from "@tanstack/ai";

/** Fallback context window when model metadata is unavailable. */
export const DEFAULT_SUMMARIZATION_CONTEXT_WINDOW = 128_000;

/** Fraction of the context window used as output reserve when the model reports no max output. */
export const SUMMARIZATION_OUTPUT_RESERVE_FALLBACK_RATIO = 0.12;

/** Approximate characters per token, used to widen the char-truncation backstop. */
export const SUMMARIZATION_CHARS_PER_TOKEN = 4;

/** Reserve tokens for system prompt, instructions, and model output. */
export const SUMMARIZATION_OVERHEAD_TOKENS = 8_000;

/** Minimum input budget so tiny models still get a usable slice. */
export const MIN_SUMMARIZATION_INPUT_BUDGET = 16_000;

/** Resolved budget for one summarization pass. */
export interface SummarizationBudget {
  /** Tokens of serialized input one summarization call can accept. */
  inputBudget: number;
  /** Model's max output tokens (falls back to a window-derived reserve). */
  maxOutputTokens: number;
}

/**
 * Resolve the budget for one summarization call from model metadata.
 *
 * The input budget reserves the model's real max output tokens (plus overhead)
 * so the summarizer round-trips a single pass without overflowing the model's
 * context window. When the model reports no `defaultMaxTokens`, a window-derived
 * output reserve is used instead (sized so a typical window still single-passes).
 *
 * @param modelInfo - Model metadata (contextWindow / defaultMaxTokens), if known
 */
export function resolveSummarizationBudget(
  modelInfo: { contextWindow?: number; defaultMaxTokens?: number } | null | undefined
): SummarizationBudget {
  const contextWindow = modelInfo?.contextWindow ?? DEFAULT_SUMMARIZATION_CONTEXT_WINDOW;
  const maxOutputTokens =
    modelInfo?.defaultMaxTokens && modelInfo.defaultMaxTokens > 0
      ? modelInfo.defaultMaxTokens
      : Math.floor(contextWindow * SUMMARIZATION_OUTPUT_RESERVE_FALLBACK_RATIO);
  const inputBudget = Math.max(
    MIN_SUMMARIZATION_INPUT_BUDGET,
    contextWindow - maxOutputTokens - SUMMARIZATION_OVERHEAD_TOKENS
  );
  return { inputBudget, maxOutputTokens };
}

/**
 * Resolve how many tokens of conversation can be sent to one summarization call.
 */
export function resolveSummarizationInputBudget(manager: AgentManager, parentAgentId: string): number {
  const parent = manager.getAgent(parentAgentId);
  return resolveSummarizationBudget(parent?.getModelInfo()).inputBudget;
}

/**
 * Split messages into batches that each fit within the summarization token budget.
 */
export function splitMessagesByTokenBudget(messages: ModelMessage[], maxTokens: number): ModelMessage[][] {
  if (messages.length === 0) return [];

  const batches: ModelMessage[][] = [];
  let current: ModelMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateTokens([message]);
    if (current.length > 0 && currentTokens + messageTokens > maxTokens) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(message);
    currentTokens += messageTokens;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}
