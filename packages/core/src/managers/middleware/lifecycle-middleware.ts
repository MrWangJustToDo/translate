/**
 * Run lifecycle middleware — usage tracking and stream side-effects.
 *
 * Status transitions live in {@link createStatusMiddleware}.
 * Turn-level finalization (`finalizeRun`: clear turn context, `agent:stop`, memory extract)
 * is owned by {@link AgentChatController.pumpToolPhases} / detached runners — not per-`chat()` finish.
 */

import { extractTanStackUsage } from "../../runtime-types/token-usage.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ModelPricing } from "../../models/types.js";
import type { UsageTracker } from "../../runtime-types";
import type { EmitAgentTelemetryFn } from "../telemetry/emit-agent-telemetry.js";
import type { ChatMiddleware } from "@tanstack/ai";

// ============================================================================
// Lifecycle middleware
// ============================================================================

export interface LifecycleMiddlewareDeps {
  usage: UsageTracker;
  getPricing: () => ModelPricing | null | undefined;
  onThinking?: () => void;
  onFirstModelOutput?: () => void;
  emitEvent?: EmitAgentTelemetryFn;
}

export function createLifecycleMiddleware(deps: LifecycleMiddlewareDeps): ChatMiddleware<ToolRunContext> {
  let memoryCommitted = false;
  let thinkingEmitted = false;
  let startTime = 0;
  // Per-round timer: reset on each RUN_STARTED so tok/s counts only pure model
  // time (tool execution between rounds is excluded from the denominator).
  let roundStart = 0;
  // Per-call observability captured for the `llm:response` timeline entry.
  let firstTokenAt = 0;
  let lastModel: string | undefined;
  let lastIteration = 0;
  let lastRoundElapsedMs = 0;
  let lastReasoningTokens = 0;
  let lastCostUsd = 0;

  return {
    name: "lifecycle",
    onStart: (ctx) => {
      memoryCommitted = false;
      thinkingEmitted = false;
      startTime = Date.now();
      roundStart = startTime;
      firstTokenAt = 0;
      lastModel = ctx.model;
      lastIteration = ctx.iteration;

      deps.emitEvent?.("llm:request", {
        model: ctx.model,
        iteration: ctx.iteration,
        messagesCount: ctx.messages.length,
        toolsCount: ctx.toolNames?.length ?? 0,
      });
    },
    onChunk: (_ctx, chunk) => {
      // TanStack fires RUN_STARTED once per model iteration (each LLM stream),
      // so this marks the start of a new round for per-round timing.
      if (chunk.type === "RUN_STARTED") {
        roundStart = Date.now();
        firstTokenAt = 0;
      }

      if (
        !thinkingEmitted &&
        (chunk.type === "REASONING_MESSAGE_START" || chunk.type === "REASONING_MESSAGE_CONTENT")
      ) {
        thinkingEmitted = true;
        if (!firstTokenAt) firstTokenAt = Date.now();
        deps.onThinking?.();
      }

      if (!memoryCommitted && chunk.type === "TEXT_MESSAGE_CONTENT") {
        memoryCommitted = true;
        if (!firstTokenAt) firstTokenAt = Date.now();
        deps.onFirstModelOutput?.();
      }

      return chunk;
    },
    onUsage: (_ctx, usage) => {
      const parsed = extractTanStackUsage(usage);
      deps.usage.updateWindowUsage(parsed, deps.getPricing());
      // onUsage fires once per model iteration (each RUN_FINISHED). Record this
      // round's wall-clock (since RUN_STARTED) + output tokens independently so
      // multi-iteration runs accumulate an accurate aggregate tok/s. Falls back
      // to the run start for rounds that never saw a RUN_STARTED.
      const roundElapsed = Date.now() - roundStart;
      deps.usage.addLlmCall(roundElapsed, parsed.outputTokens);
      lastRoundElapsedMs = roundElapsed;
      lastReasoningTokens = deps.usage.getLastCallReasoningTokens();
      lastCostUsd = deps.usage.getLastCallCostUsd();
    },
    onFinish: (_ctx, info) => {
      // Rounds are already recorded per-iteration in onUsage; nothing to add
      // here. Emit telemetry with the overall run duration.
      const windowUsage = deps.usage.getWindowUsage();
      deps.emitEvent?.("llm:response", {
        model: lastModel,
        iteration: lastIteration,
        finishReason: info.finishReason ?? undefined,
        inputTokens: windowUsage.inputTokens,
        outputTokens: windowUsage.outputTokens,
        cacheReadTokens: windowUsage.cacheReadTokens ?? 0,
        cacheWriteTokens: windowUsage.cacheWriteTokens ?? 0,
        reasoningTokens: lastReasoningTokens,
        costUsd: lastCostUsd,
        roundElapsedMs: lastRoundElapsedMs,
        firstTokenMs: firstTokenAt > 0 ? firstTokenAt - roundStart : undefined,
        durationMs: Date.now() - startTime,
      });
    },
  };
}
