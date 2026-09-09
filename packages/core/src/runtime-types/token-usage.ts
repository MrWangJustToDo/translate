// ============================================================================
// Token Usage
// ============================================================================

import type { ModelPricing } from "../models/types.js";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

/**
 * Calculate the cost of a token usage entry given pricing info.
 * Accounts for cache read/write tokens billed at their own rates.
 * Returns cost in USD.
 */
export function calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const normalInput = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);

  const inputCost = normalInput * pricing.inputPerM;
  const cacheReadCost = cacheRead * (pricing.cacheReadPerM ?? pricing.inputPerM);
  const cacheWriteCost = cacheWrite * (pricing.cacheWritePerM ?? pricing.inputPerM);
  const outputCost = usage.outputTokens * pricing.outputPerM;

  return (inputCost + cacheReadCost + cacheWriteCost + outputCost) / 1_000_000;
}

/**
 * Extract the provider id reported by AG-UI `SpecTokenUsage[]` entries
 * (first non-empty). Single-object usage carries no provider — returns
 * undefined. Lets timeline events attribute usage/cost to a provider.
 */
export function extractTanStackProvider(
  usage:
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      }
    | Array<{
        provider?: string;
      }>
): string | undefined {
  if (!Array.isArray(usage)) return undefined;
  for (const entry of usage) {
    if (entry.provider) return entry.provider;
  }
  return undefined;
}

/**
 * Map TanStack usage from `@tanstack/ai` RUN_FINISHED to core TokenUsage.
 *
 * TanStack 0.48+ allows `usage` to be either a single `TokenUsage` or an
 * AG-UI `SpecTokenUsage[]` array (one entry per model iteration). Arrays are
 * summed into one TokenUsage so multi-iteration runs report cumulative tokens.
 */
export function extractTanStackUsage(
  usage:
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        promptTokensDetails?: { cachedTokens?: number };
        completionTokensDetails?: { reasoningTokens?: number };
      }
    | Array<{
        provider?: string;
        model?: string;
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
      }>
): TokenUsage {
  if (Array.isArray(usage)) {
    let input = 0;
    let output = 0;
    let total = 0;
    let cacheRead = 0;
    let reasoning = 0;
    for (const entry of usage) {
      input += entry.inputTokens ?? 0;
      output += entry.outputTokens ?? 0;
      total += entry.totalTokens ?? 0;
      cacheRead += entry.cachedInputTokens ?? 0;
      reasoning += entry.reasoningTokens ?? 0;
    }
    return {
      inputTokens: input,
      outputTokens: output,
      totalTokens: total || input + output,
      cacheReadTokens: cacheRead || undefined,
      reasoningTokens: reasoning || undefined,
    };
  }

  const input = usage.promptTokens ?? 0;
  const output = usage.completionTokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: usage.totalTokens ?? input + output,
    cacheReadTokens: usage.promptTokensDetails?.cachedTokens ?? undefined,
    reasoningTokens: usage.completionTokensDetails?.reasoningTokens ?? undefined,
  };
}
