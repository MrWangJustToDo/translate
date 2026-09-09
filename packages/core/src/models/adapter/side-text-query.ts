import { chat } from "@tanstack/ai";

import { sharedUsageHistory } from "../../agent/usage/usage-history-service.js";
import { calculateCost, extractTanStackUsage, type TokenUsage } from "../../runtime-types/token-usage.js";

import type { TextAdapterConfig } from "./adapter-factory.js";

// ============================================================================
// Types
// ============================================================================

export interface SideTextQueryOptions {
  systemPrompt?: string;
  userPrompt: string;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  /**
   * Whether to disable model reasoning/thinking for this lightweight call.
   * Defaults to `true` — memory selection and title generation don't need CoT.
   */
  disableThinking?: boolean;
}

export interface SideTextQueryResult {
  text: string;
  usage?: TokenUsage;
  /** Wall-clock duration of the underlying LLM call (ms). */
  durationMs: number;
}

// ============================================================================
// Side text query
// ============================================================================

/**
 * One-shot text generation via TanStack `chat()`.
 * Used for memory selection, session titles, and other lightweight LLM calls.
 */
export async function runSideTextQuery(
  textAdapter: TextAdapterConfig,
  options: SideTextQueryOptions
): Promise<SideTextQueryResult> {
  const abortController = new AbortController();
  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      abortController.abort(options.abortSignal.reason);
    } else {
      options.abortSignal.addEventListener("abort", () => abortController.abort(options.abortSignal!.reason), {
        once: true,
      });
    }
  }

  const startTime = Date.now();
  const disableThinking = options.disableThinking ?? true;
  const reasoningOptions =
    disableThinking && textAdapter.reasoning
      ? textAdapter.modelStyle === "anthropic"
        ? { thinking: { type: "disabled" } }
        : { reasoning_effort: "none" }
      : {};
  const stream = chat({
    adapter: textAdapter.adapter,
    messages: [{ role: "user", content: options.userPrompt }],
    systemPrompts: options.systemPrompt ? [options.systemPrompt] : undefined,
    abortController,
    debug: false,
    modelOptions: {
      ...(options.maxOutputTokens != null ? { maxTokens: options.maxOutputTokens } : {}),
      ...reasoningOptions,
    },
  });

  let text = "";
  let usage: TokenUsage | undefined;

  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      text += chunk.delta;
    }
    if (chunk.type === "RUN_FINISHED" && chunk.usage) {
      usage = extractTanStackUsage(chunk.usage);
      // Global usage-history record: side queries (titles, summaries, memory
      // selection) are real LLM calls and must show up in the contribution
      // graph. Cost uses the adapter's own model pricing (0 when unknown).
      if (usage) {
        sharedUsageHistory.record({
          agentId: "side-query",
          model: textAdapter.model,
          usage,
          costUsd: textAdapter.pricing ? calculateCost(usage, textAdapter.pricing) : 0,
        });
      }
    }
    if (chunk.type === "RUN_ERROR") {
      const message =
        chunk.error instanceof Error ? chunk.error.message : String(chunk.error ?? "Side text query failed");
      throw new Error(message);
    }
  }

  return { text: text.trim(), usage, durationMs: Date.now() - startTime };
}
