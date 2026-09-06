/**
 * Compaction Types - Type definitions for the context compaction system.
 *
 * - Layer 1 (tool_compact): `toModelOutput` transforms (cached per toolCallId)
 * - Layer 2 (auto_compact): LLM-based summarization when threshold exceeded
 * Manual compaction: CLI `/compact` (same engine as auto_compact)
 */

import { z } from "zod";

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for compaction configuration.
 */
export const compactionConfigSchema = z.object({
  /** Token threshold (context window size) for auto-compaction (default: 100000) */
  tokenThreshold: z.number().int().positive().default(100000),
  /** Percentage of tokenThreshold at which compaction triggers (default: 80) */
  compactAtPercent: z.number().min(50).max(99).default(80),
  /** Number of recent user turns (inclusive) to keep after compaction (default: 2; legacy fallback) */
  keepRecentFlows: z.number().int().positive().default(2),
  /**
   * Token budget for the kept window after compaction. When set, overrides
   * `keepRecentFlows`; when unset, derived from the model context window
   * (see keep-policy.ts) with `keepRecentFlows` as final fallback.
   */
  keepRecentTokens: z.number().int().positive().optional(),
  /** Tokens reserved for summary + next turn in window-relative derivation (default: 16384) */
  reserveTokens: z.number().int().positive().optional(),
});

/**
 * Schema for compaction result.
 */
export const compactionResultSchema = z.object({
  /** Whether compaction was performed */
  compacted: z.boolean(),
  /** Estimated tokens before compaction */
  tokensBefore: z.number().int().nonnegative(),
  /** Estimated tokens after compaction */
  tokensAfter: z.number().int().nonnegative(),
  /** Type of compaction performed */
  type: z.enum(["micro", "auto", "manual", "reactive"]).optional(),
  /** Summary generated if auto/manual/reactive compaction */
  summary: z.string().optional(),
  /** Index in the input messages where the kept portion starts (messages before this were summarized) */
  cutIndex: z.number().int().nonnegative().optional(),
  /** Error message if compaction failed */
  error: z.string().optional(),
});

// ============================================================================
// Types
// ============================================================================

/**
 * Compaction configuration options.
 */
export type CompactionConfig = z.infer<typeof compactionConfigSchema>;

/**
 * Input type for partial compaction config (all fields optional).
 */
export type CompactionConfigInput = z.input<typeof compactionConfigSchema>;

/**
 * Result of a compaction operation.
 */
export type CompactionResult = z.infer<typeof compactionResultSchema>;

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default compaction configuration values.
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  tokenThreshold: 100000,
  compactAtPercent: 90,
  keepRecentFlows: 2,
};

/**
 * Create a compaction config with defaults applied.
 *
 * @param input - Partial configuration to merge with defaults
 * @returns Complete compaction configuration
 *
 * @example
 * ```typescript
 * const config = createCompactionConfig({ tokenThreshold: 50000 });
 * // Result: { tokenThreshold: 50000, compactAtPercent: 80, keepRecentFlows: 2 }
 * ```
 */
export function createCompactionConfig(input?: CompactionConfigInput): CompactionConfig {
  if (!input) return { ...DEFAULT_COMPACTION_CONFIG };
  return compactionConfigSchema.parse(input);
}
