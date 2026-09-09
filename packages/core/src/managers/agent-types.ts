import { z } from "zod";

import { DEFAULT_AGENT_MAX_ITERATIONS } from "../runtime-types/agent-limits.js";

import type { ReasoningEffort } from "../models/types.js";
import type { ModelMessage } from "@tanstack/ai";

// ============================================================================
// Agent Config
// ============================================================================

export const REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "minimal",
];

/** Default maximum agentic-loop iterations for the main agent run loop (defined in runtime-types, re-exported for manager-side consumers). */
export { DEFAULT_AGENT_MAX_ITERATIONS } from "../runtime-types/agent-limits.js";

export const AgentConfigSchema = z.object({
  model: z.string().min(1).describe("Model name to use"),
  modelStyle: z.enum(["openai", "anthropic"]).optional().describe("API style (OpenAI-compatible or Anthropic)"),
  modelBaseURL: z.string().optional().describe("Base URL for the model API"),
  modelApiKey: z.string().optional().describe("API key for the model endpoint"),
  systemPrompt: z.string().optional().describe("System prompt for the agent"),
  maxIterations: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(DEFAULT_AGENT_MAX_ITERATIONS)
    .describe("Maximum agentic loop iterations"),
  maxTokens: z.number().int().min(1).optional().describe("Maximum tokens per response"),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature"),
  reasoningEffort: z
    .enum(REASONING_EFFORT_VALUES)
    .optional()
    .describe("Reasoning effort level for reasoning-capable models"),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================================================
// Agent Status (compat re-exports)
// ============================================================================

export type { AgentStatus, RunFinalizeReason } from "../runtime-types/agent-status.js";

// ============================================================================
// Run options
// ============================================================================

export interface AgentRunOptions {
  prompt?: string;
  messages?: ModelMessage[];
  abortSignal?: AbortSignal;
}
