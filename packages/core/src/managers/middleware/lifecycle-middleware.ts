/**
 * Run lifecycle middleware — usage tracking and stream side-effects.
 *
 * Status transitions live in {@link createStatusMiddleware}.
 * Turn-level finalization (`finalizeRun`: clear turn context, `agent:stop`, memory extract)
 * is owned by {@link AgentChatController.pumpToolPhases} / detached runners — not per-`chat()` finish.
 */

import { extractTanStackProvider, extractTanStackUsage } from "../../runtime-types/token-usage.js";

import type { ToolRunContext } from "../../agent/runner/run-context.js";
import type { ModelPricing } from "../../models/types.js";
import type { UsageTracker } from "../../runtime-types";
import type { TokenUsage } from "../../runtime-types/token-usage.js";
import type { EmitAgentTelemetryFn } from "../telemetry/emit-agent-telemetry.js";
import type { ChatMiddleware } from "@tanstack/ai";

// ============================================================================
// Lifecycle middleware
// ============================================================================

/**
 * Provider id from the `provider/model` model-id convention
 * ("deepseek/deepseek-v4-flash-0731" → "deepseek"). The runtime pipeline never
 * surfaces a provider name — the OpenAI-base adapters map only token fields and
 * `rebuildTokenUsage` folds AG-UI `SpecTokenUsage[]` into a single object before
 * `onUsage` — so the model prefix is the only reliable source. Returns undefined
 * for bare model ids (no `/`).
 */
function providerFromModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : undefined;
}

export interface LifecycleMiddlewareDeps {
  usage: UsageTracker;
  getPricing: () => ModelPricing | null | undefined;
  onThinking?: () => void;
  onFirstModelOutput?: () => void;
  emitEvent?: EmitAgentTelemetryFn;
  /** Global usage-history hook: record each model iteration's tokens + cost. */
  recordUsage?: (input: { model?: string; usage: TokenUsage; costUsd: number }) => void;
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
  let lastProvider: string | undefined;
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
        // Sticky from the previous iteration; falls back to the model-id prefix
        // for the first request of a run (usage never carries a provider here —
        // see {@link providerFromModel}).
        provider: lastProvider ?? providerFromModel(ctx?.model),
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
    onUsage: (ctx, usage) => {
      const parsed = extractTanStackUsage(usage);
      // AG-UI SpecTokenUsage[] entries carry a provider; keep the extractor as
      // the preferred source (future-proof) and fall back to the model prefix.
      lastProvider = extractTanStackProvider(usage) ?? providerFromModel(ctx?.model) ?? lastProvider;
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
      deps.recordUsage?.({ model: ctx.model ?? lastModel, usage: parsed, costUsd: lastCostUsd });
    },
    onFinish: (_ctx, info) => {
      // Rounds are already recorded per-iteration in onUsage; nothing to add
      // here. Emit telemetry with the overall run duration.
      const windowUsage = deps.usage.getWindowUsage();
      deps.emitEvent?.("llm:response", {
        model: lastModel,
        provider: lastProvider,
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
