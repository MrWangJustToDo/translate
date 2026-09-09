/**
 * Keep policy resolution for compaction.
 *
 * The kept window after compaction is decided by a token budget
 * (`keepRecentTokens`) instead of a fixed count of user turns. When the budget
 * is not explicitly configured and the model's context window is known, it is
 * derived as a bounded fraction of that window. When no context window is
 * known, the system falls back to legacy `keepRecentFlows` turn counting.
 */

import { createCompactionConfig } from "./types.js";

import type { CompactionConfig } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Fraction of the model context window kept after compaction (opencode-style). */
export const KEEP_RECENT_WINDOW_RATIO = 0.25;

/** Cap on the derive-reserve as a fraction of the window (reserve never exceeds this). */
export const RESERVE_WINDOW_CAP_RATIO = 0.25;

/** Upper bound for the derived keep budget. */
export const KEEP_RECENT_WINDOW_CAP = 64_000;

/** Lower bound so tiny-window models still retain a usable working set. */
export const KEEP_RECENT_WINDOW_MIN = 4_000;

/** Tokens reserved for the summary + next turn when deriving thresholds. */
export const DEFAULT_RESERVE_TOKENS = 16_384;

// ============================================================================
// Types
// ============================================================================

/**
 * Resolved keep policy for one agent.
 *
 * - `tokens`: keep the most recent messages whose estimated tokens fit in
 *   {@link KeepPolicy.keepRecentTokens} (pairing-safe boundaries). This is the
 *   default/preferred path (driven by the model context window).
 * - `turns` (@deprecated): legacy behavior — keep the last
 *   {@link KeepPolicy.keepRecentFlows} real user turns. Only reached when no
 *   context window is known and no explicit `keepRecentTokens` is configured.
 */
export interface KeepPolicy {
  kind: "tokens" | "turns";
  keepRecentTokens?: number;
  /** @deprecated Legacy fallback — prefer `keepRecentTokens` (the `tokens` kind). */
  keepRecentFlows?: number;
}

// ============================================================================
// Public API
// ============================================================================

/** Effective reserve tokens for window-relative derivation. */
export function resolveReserveTokens(config?: Partial<CompactionConfig>): number {
  return config?.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
}

/**
 * Clamp the reserve to a fraction of the context window. A fixed reserve
 * larger than ~25% of a small window would push the trigger point into
 * constant-compaction territory (or below zero usable space).
 */
function effectiveReserveTokens(reserveTokens: number, contextWindow: number): number {
  const cap = Math.max(1, Math.floor(contextWindow * RESERVE_WINDOW_CAP_RATIO));
  return Math.min(Math.max(0, reserveTokens), cap);
}

/**
 * Derive a keep budget from the model context window.
 */
export function deriveKeepRecentTokens(contextWindow: number, reserveTokens = DEFAULT_RESERVE_TOKENS): number {
  const usable = Math.max(0, contextWindow - effectiveReserveTokens(reserveTokens, contextWindow));
  if (usable <= 0) return KEEP_RECENT_WINDOW_MIN;
  return Math.min(
    KEEP_RECENT_WINDOW_CAP,
    Math.max(KEEP_RECENT_WINDOW_MIN, Math.floor(usable * KEEP_RECENT_WINDOW_RATIO))
  );
}

/**
 * Resolve the keep policy for an agent.
 *
 * Priority: explicit `keepRecentTokens` > derived-from-context-window (tokens)
 * > legacy `keepRecentFlows` (@deprecated — only reached when no context window
 * is known and no explicit `keepRecentTokens` is configured).
 *
 * @param config - Compaction config (partial; defaults applied where relevant)
 * @param contextWindow - Model input context window in tokens, if known
 */
export function resolveKeepPolicy(
  config: Partial<CompactionConfig> | null | undefined,
  contextWindow?: number
): KeepPolicy {
  const resolved = createCompactionConfig(config ?? undefined);
  const explicit = resolved.keepRecentTokens;
  if (explicit && explicit > 0) {
    return { kind: "tokens", keepRecentTokens: explicit };
  }
  if (contextWindow && contextWindow > 0) {
    return {
      kind: "tokens",
      keepRecentTokens: deriveKeepRecentTokens(contextWindow, resolveReserveTokens(resolved)),
    };
  }
  return { kind: "turns", keepRecentFlows: resolved.keepRecentFlows };
}

/**
 * Projection options payload derived from a keep policy — spread into
 * `getModelVisibleMessages` / `applyCompactionResult` options.
 */
export function keepPolicyProjectionOptions(policy: KeepPolicy): {
  keepRecentTokens?: number;
  keepRecentFlows?: number;
} {
  return policy.kind === "tokens"
    ? { keepRecentTokens: policy.keepRecentTokens }
    : { keepRecentFlows: policy.keepRecentFlows };
}

/**
 * Resolve the absolute token count at which auto-compaction triggers.
 *
 * The trigger base is the **working budget** (`tokenThreshold`) — the same
 * number the UI shows as 100%. The agent factory auto-fills it as
 * `min(contextWindow, MAX_THRESHOLD)` when unset, so a huge models.dev window
 * (e.g. 1M) never defers compaction past the displayed budget; the threshold
 * is still clamped to the real window so an oversized config cannot defer
 * compaction past what the model accepts.
 *
 * @returns absolute trigger point in input tokens
 */
export function resolveAutoCompactTrigger(
  config: Partial<CompactionConfig>,
  contextWindow?: number
): { triggerAt: number } {
  const resolved = createCompactionConfig(config);
  const limit =
    contextWindow && contextWindow > 0 ? Math.min(resolved.tokenThreshold, contextWindow) : resolved.tokenThreshold;
  return { triggerAt: Math.floor((limit * resolved.compactAtPercent) / 100) };
}
