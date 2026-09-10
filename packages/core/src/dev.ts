/**
 * Internal re-exports for core validation scripts (`pnpm validate:*`).
 * Not part of the public `@my-agent/core` package API.
 */

export * from "./dev/dev-agent.js";
export * from "./dev/dev-managers.js";
export * from "./dev/dev-models.js";

// Command safety (internal validation exports — not part of public API)
export { analyzeCommand, createAnalysisContext } from "./agent/tools/command-safety/command-analyzer.js";
export {
  evaluateCommandApproval,
  SUBAGENT_DENY_MESSAGE,
} from "./agent/tools/command-safety/command-approval-policy.js";
export { commandPrefix, normalizedCommand } from "./agent/tools/command-safety/command-arity.js";

// Root-level modules
export { Emitter } from "./utils/emitter.js";
export {
  AGENT_SESSION_CHANNELS,
  DEFAULT_AGENT_SESSION_CHANNELS,
  createLocalAgentSession,
  createLocalAgentSessionHost,
  sessionForSubagent,
} from "./agent-session";
export { generateId, resetGeneratedIdsForTesting } from "./utils/generate-id.js";
export { clearCoreEnv, registerCoreEnv } from "./env.js";
export type { CoreEnv } from "./env.js";
// ============================================================================
// Built-in LSP extension (internal validation exports — not part of public API)
// ============================================================================
// ============================================================================
// Built-in Memory extension (internal validation exports — not part of public API)
// ============================================================================
// ============================================================================
// Built-in Skills extension (internal validation exports — not part of public API)
// ============================================================================
// ============================================================================
// Built-in Code Mode extension (internal validation exports — not part of public API)
// ============================================================================
export { createCodeModeExtension, type CodeModeExtensionConfig } from "./agent/code-mode/extension.js";
