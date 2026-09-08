import type { AgentEventPayloadMap } from "./agent-event-payloads.js";

// ============================================================================
// Event Types
// ============================================================================

/** Agent lifecycle event types (emitted via ManagedAgent.emitEvent / emitAgentTelemetry). */
export type AgentEventType =
  | "session:doc"
  | "session:memory"
  | "session:mcp"
  | "session:skill"
  | "session:start"
  | "session:restore"
  | "session:save-error"
  | "prompt:submit"
  | "prompt:before"
  | "agent:thinking"
  | "agent:tool-start"
  | "agent:tool-approval-request"
  | "agent:tool-approval-resolved"
  | "agent:tool-end"
  | "agent:tool-error"
  | "agent:abort"
  | "agent:retry"
  | "agent:stream-error"
  | "agent:stop"
  | "agent:extension-error"
  | "memory:prefetch"
  | "memory:extract"
  | "memory:consolidate"
  | "llm:request"
  | "llm:response"
  | "turn:summary"
  | "compaction:auto-start"
  | "compaction:auto-complete"
  | "compaction:auto-error"
  | "compaction:reactive-start"
  | "compaction:reactive-complete"
  | "compaction:reactive-error"
  | "compaction:reactive-max-retries"
  | "subagent:created"
  | "subagent:started"
  | "subagent:completed"
  | "subagent:error"
  | "subagent:destroyed"
  | "subagent:phase"
  | "subagent:ui-update"
  | "subagent:progress-summary-error"
  | "plan:enter"
  | "plan:ready"
  | "plan:execute"
  | "plan:cancel-execution"
  | "plan:todo-replaced"
  | "plan:retro"
  | "plan:complete"
  | "plan:exit";

/** Callback shape for services/middleware that emit lifecycle telemetry. */
export type EmitAgentTelemetryFn = <T extends AgentEventType>(type: T, payload?: AgentEventPayloadMap[T]) => void;
