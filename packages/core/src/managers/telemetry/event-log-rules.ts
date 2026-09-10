/**
 * Default event → AgentLog mapping for {@link bridgeTelemetryToAgentLog}.
 */

import type { AgentEvent, AgentEventType } from "../../agent/agent-event-bus";
import type { LogCategory, LogLevel } from "../../agent/agent-log/types.js";
import type { AgentEventPayloadMap } from "../../runtime-types/agent-event-payloads.js";

/** Read payload fields for logging formatters. */
function p(event: AgentEvent): Record<string, unknown> {
  return event.payload as Record<string, unknown>;
}

export interface EventLogRule {
  level: LogLevel;
  category: LogCategory;
  formatMessage: (event: AgentEvent) => string;
}

/**
 * Telemetry-only mapping. Typed against the payload map so every telemetry
 * event still requires an entry (compile-checked) while session-projection
 * events (e.g. `agent:state`) stay out of the log stream.
 */
const TELEMETRY_EVENT_LOG_RULES: Record<keyof AgentEventPayloadMap, EventLogRule | false> = {
  // ============================================================================
  // Session lifecycle
  // ============================================================================
  "session:start": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Session started (cwd: ${p(event).cwd ?? "unknown"})`,
  },
  "session:doc": {
    level: "info",
    category: "system",
    formatMessage: (event) => (p(event).message as string) ?? "Agent documentation loaded",
  },
  "session:skill": {
    level: "debug",
    category: "skill",
    formatMessage: (event) => `Loaded ${p(event).count ?? 0} skills`,
  },
  "session:mcp": false,
  "session:memory": {
    level: "info",
    category: "memory",
    formatMessage: (event) => {
      const memoryCount = p(event).memoryCount;
      const count = typeof memoryCount === "number" ? memoryCount : 0;
      return count > 0 ? `Memory initialized (${count} memories)` : "Memory initialized (empty)";
    },
  },
  "session:restore": {
    level: "info",
    category: "system",
    formatMessage: (event) =>
      `Session restored: ${p(event).messageCount ?? "?"} messages, ${p(event).tokenEstimate ?? "?"} tokens`,
  },
  "session:save-error": {
    level: "warn",
    category: "system",
    formatMessage: (event) => `Failed to save session ${p(event).target ?? "data"}: ${p(event).error ?? "unknown"}`,
  },

  // ============================================================================
  // Turn lifecycle
  // ============================================================================
  "prompt:submit": {
    level: "info",
    category: "chat",
    formatMessage: (event) => {
      const prompt = p(event).prompt as string | undefined;
      const preview = prompt ? (prompt.length > 80 ? prompt.slice(0, 80) + "..." : prompt) : "";
      const msgCount = p(event).contextMessageCount ?? "?";
      return `Prompt: ${preview}  (${msgCount} context messages)`;
    },
  },
  "prompt:before": {
    level: "debug",
    category: "chat",
    formatMessage: (event) => {
      const hasTurn = p(event).hasTurnContext ? "turn+ctx" : "no-turn-ctx";
      return `Extension prompt hooks (${hasTurn})`;
    },
  },
  "turn:summary": {
    level: "info",
    category: "chat",
    formatMessage: (event) => {
      const d = p(event);
      const outcome = d.outcome ? ` (${d.outcome})` : "";
      const llmCalls = d.llmCalls ?? "?";
      const toolCalls = d.toolCalls ?? "?";
      const inTokens = d.inputTokens ?? "?";
      const outTokens = d.outputTokens ?? "?";
      const cost = typeof d.costUsd === "number" && d.costUsd > 0 ? `, $${d.costUsd.toFixed(4)}` : "";
      const ms = d.durationMs ?? "?";
      return `Turn complete${outcome}: ${llmCalls} LLM calls, ${toolCalls} tools, ${inTokens}→${outTokens} tokens${cost}, ${ms}ms`;
    },
  },
  "agent:thinking": {
    level: "debug",
    category: "agent",
    formatMessage: () => "Model reasoning started",
  },
  "agent:stop": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Agent stop (${p(event).reason ?? "unknown"})`,
  },
  "agent:extension-error": {
    level: "error",
    category: "system",
    formatMessage: (event) =>
      `Extension ${p(event).phase ?? ""} failed "${p(event).extensionId ?? event.agentId}": ${p(event).error ?? "unknown"}`.trim(),
  },
  "agent:abort": {
    level: "warn",
    category: "agent",
    formatMessage: (event) => `Agent aborted (${p(event).reason ?? "unknown"})`,
  },
  "agent:retry": {
    level: "warn",
    category: "llm",
    formatMessage: (event) => {
      const d = p(event);
      const head = `Retry ${d.attempt ?? "?"}/${d.maxAttempts ?? "?"} (${d.strategy ?? "unknown"})`;
      const wait = typeof d.delayMs === "number" ? ` in ${Math.round(d.delayMs / 1000)}s` : "";
      const err = d.error ? `: ${String(d.error).slice(0, 120)}` : "";
      return `${head}${wait}${err}`;
    },
  },
  "agent:stream-error": {
    level: "error",
    category: "agent",
    formatMessage: (event) => `Stream error: ${p(event).error ?? "unknown"}`,
  },

  // ============================================================================
  // LLM calls
  // ============================================================================
  "llm:request": {
    level: "debug",
    category: "llm",
    formatMessage: (event) => {
      const d = p(event);
      const iter = d.iteration != null ? ` [iter ${d.iteration}]` : "";
      return `LLM request: ${d.model ?? "?"}${iter} (${d.messagesCount ?? "?"} msgs, ${d.toolsCount ?? 0} tools)`;
    },
  },
  "llm:response": {
    level: "info",
    category: "llm",
    formatMessage: (event) => {
      const d = p(event);
      const fr = d.finishReason ?? "?";
      const iter = d.iteration != null ? ` [iter ${d.iteration}]` : "";
      const inT = d.inputTokens ?? "?";
      const outT = d.outputTokens ?? "?";
      const cache = d.cacheReadTokens ? ` (cache +${d.cacheReadTokens})` : "";
      const reasoning = d.reasoningTokens ? ` (reasoning ${d.reasoningTokens})` : "";
      const cost = typeof d.costUsd === "number" && d.costUsd > 0 ? ` $${d.costUsd.toFixed(4)}` : "";
      const firstToken = typeof d.firstTokenMs === "number" ? `, first token ${d.firstTokenMs}ms` : "";
      const round = typeof d.roundElapsedMs === "number" ? `, round ${d.roundElapsedMs}ms` : "";
      const ms = d.durationMs ?? "?";
      return `LLM response: ${fr}${iter}  ${inT}→${outT} tokens${cache}${reasoning}${cost}  ${ms}ms${firstToken}${round}`;
    },
  },

  // ============================================================================
  // Tools
  // ============================================================================
  "agent:tool-start": {
    level: "debug",
    category: "tool",
    formatMessage: (event) => `Tool start: ${p(event).tool_name ?? "unknown"}`,
  },
  "agent:tool-approval-request": {
    level: "info",
    category: "approval",
    formatMessage: (event) => `Approval requested: ${p(event).tool_name ?? "unknown"}`,
  },
  "agent:tool-approval-resolved": {
    level: "info",
    category: "approval",
    formatMessage: (event) => {
      const d = p(event);
      const reason = d.reason ? ` — ${d.reason}` : "";
      return `Approval resolved: ${d.tool_name ?? d.tool_call_id ?? "unknown"} (${d.decision ?? "?"})${reason}`;
    },
  },
  "agent:tool-end": {
    level: "debug",
    category: "tool",
    formatMessage: (event) => {
      const name = p(event).tool_name ?? "unknown";
      const duration = p(event).duration_ms;
      return duration != null ? `Tool end: ${name} (${duration}ms)` : `Tool end: ${name}`;
    },
  },
  "agent:tool-error": {
    level: "warn",
    category: "tool",
    formatMessage: (event) => `Tool error: ${p(event).tool_name ?? "unknown"} — ${p(event).error ?? "unknown"}`,
  },

  // ============================================================================
  // Memory
  // ============================================================================
  "memory:prefetch": false,
  "memory:extract": false,
  "memory:consolidate": false,

  // ============================================================================
  // Compaction
  // ============================================================================
  "compaction:auto-start": false,
  "compaction:auto-complete": false,
  "compaction:auto-error": false,
  "compaction:reactive-start": {
    level: "info",
    category: "compaction",
    formatMessage: (event) =>
      `Reactive compact triggered (retry ${p(event).retry ?? "?"}/${p(event).maxRetries ?? "?"})`,
  },
  "compaction:reactive-complete": {
    level: "info",
    category: "compaction",
    formatMessage: (event) =>
      `Reactive compact: ${p(event).originalCount ?? "?"}→${p(event).compactedCount ?? "?"} messages, ` +
      `${p(event).tokensBefore ?? "?"}→${p(event).tokensAfter ?? "?"} tokens`,
  },
  "compaction:reactive-error": {
    level: "error",
    category: "compaction",
    formatMessage: (event) => `Reactive compact failed: ${p(event).error ?? "unknown"}`,
  },
  "compaction:reactive-max-retries": {
    level: "error",
    category: "compaction",
    formatMessage: () => "Reactive compact: max retries exceeded, giving up",
  },

  // ============================================================================
  // Subagents
  // ============================================================================
  "subagent:created": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Subagent created: ${p(event).subagentId ?? event.agentId}`,
  },
  "subagent:started": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Subagent started: ${p(event).description ?? event.agentId}`,
  },
  "subagent:completed": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Subagent completed: ${p(event).summary ?? "(no summary)"}`,
  },
  "subagent:error": {
    level: "error",
    category: "system",
    formatMessage: (event) => `Subagent error: ${p(event).error ?? "unknown"}`,
  },
  "subagent:progress-summary-error": {
    level: "warn",
    category: "system",
    formatMessage: (event) =>
      `Progress summary failed for subagent ${p(event).subagentId ?? event.agentId}: ${p(event).error ?? "unknown"}`,
  },
  "subagent:destroyed": {
    level: "info",
    category: "system",
    formatMessage: (event) => `Subagent destroyed: ${p(event).subagentId ?? event.agentId}`,
  },
  "subagent:phase": {
    level: "debug",
    category: "agent",
    formatMessage: (event) => `Subagent phase → ${p(event).phase ?? "?"}`,
  },
  // UI streaming channel (messageCount per pump) — not diagnostic value, keep off.
  "subagent:ui-update": false,

  // ============================================================================
  // Plan mode
  // ============================================================================
  "plan:enter": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan mode: planning (read-only)",
  },
  "plan:ready": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Plan ready (${p(event).stepCount ?? "?"} steps) — /mode execute to run`,
  },
  "plan:execute": {
    level: "info",
    category: "agent",
    formatMessage: (event) => {
      const steps = p(event).stepCount ?? "?";
      const replaced = p(event).replacedExistingTodos ? " (replaced existing todos)" : "";
      return `Plan execution started (${steps} steps)${replaced}`;
    },
  },
  "plan:cancel-execution": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan execution paused — back to ready (read-only)",
  },
  "plan:todo-replaced": {
    level: "info",
    category: "agent",
    formatMessage: (event) => `Plan todos replaced previous list (${p(event).stepCount ?? "?"} steps)`,
  },
  "plan:retro": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan retrospective — review against the plan, then complete_plan or /mode done",
  },
  "plan:complete": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan complete — plan mode off",
  },
  "plan:exit": {
    level: "info",
    category: "agent",
    formatMessage: () => "Plan mode off",
  },
};

/** Default event → log rule lookup (session-projection events are intentionally absent). */
export const DEFAULT_EVENT_LOG_RULES: Partial<Record<AgentEventType, EventLogRule | false>> = TELEMETRY_EVENT_LOG_RULES;
