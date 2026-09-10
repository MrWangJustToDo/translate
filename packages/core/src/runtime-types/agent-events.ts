import type { AgentEventPayloadMap } from "./agent-event-payloads.js";

// ============================================================================
// Event Types
// ============================================================================

/**
 * Agent telemetry event types (emitted via ManagedAgent.emitEvent /
 * emitAgentTelemetry). Derived from the payload map — the authoritative full
 * registry (including session-projection events) lives on `AgentEventBus`.
 */
export type AgentEventType = keyof AgentEventPayloadMap;

/** Callback shape for services/middleware that emit lifecycle telemetry. */
export type EmitAgentTelemetryFn = <T extends AgentEventType>(type: T, payload?: AgentEventPayloadMap[T]) => void;
