/**
 * Streaming Callback — bus-scoped multicast bridge for tool stdout/stderr.
 *
 * The former per-agent callback registry is gone: streaming output is emitted
 * as `tool:chunk` / `tool:clear` observer events on the agent's scoped unified
 * bus (registered per agent in `ManagedAgent.setEventBus`). Hosts consume them
 * via the AgentSession `tool` channel; in-process callers subscribe with
 * `bus.on("tool:chunk" / "tool:clear")`.
 */

// ============================================================================
// Types
// ============================================================================

import type { AgentEventBus } from "../../agent-event-bus";

export interface StreamingChunk {
  toolCallId: string;
  type: "stdout" | "stderr";
  chunk: string;
}

export interface StreamingEmitOptions {
  /** Target agent scope. */
  agentId: string;
}

// ============================================================================
// State
// ============================================================================

/** Agent id → scoped unified event bus (for the `tool` channel projection). */
const agentEventBuses = new Map<string, AgentEventBus>();

/**
 * @internal Register an agent's scoped unified event bus so streaming output is
 * emitted as `tool:chunk` / `tool:clear` observer events.
 */
export function registerStreamingEventBus(agentId: string, bus: AgentEventBus): void {
  agentEventBuses.set(agentId, bus);
}

/** @internal Drop the registered bus for an agent (teardown / tests). */
export function unregisterStreamingEventBus(agentId: string): void {
  agentEventBuses.delete(agentId);
}

/**
 * Emit a streaming chunk to the agent's scoped bus (`tool` channel projection).
 */
export function emitStreamingChunk(
  toolCallId: string,
  type: "stdout" | "stderr",
  chunk: string,
  options: StreamingEmitOptions
): void {
  agentEventBuses.get(options.agentId)?.emit("tool:chunk", {
    kind: "chunk",
    chunk: { toolCallId, type, chunk },
  });
}

/**
 * Clear streamed output for a tool call (e.g. before a subagent retry).
 */
export function clearStreamingOutput(toolCallId: string, options: StreamingEmitOptions): void {
  agentEventBuses.get(options.agentId)?.emit("tool:clear", { kind: "clear", toolCallId });
}

/** Reset registered buses (validation only). */
export function resetStreamingCallbacksForTests(): void {
  agentEventBuses.clear();
}
