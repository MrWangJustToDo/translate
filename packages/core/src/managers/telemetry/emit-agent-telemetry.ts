import type { AgentEvent } from "../../agent/agent-event-bus";
import type { AgentEventPayloadMap } from "../../runtime-types/agent-event-payloads.js";
import type { EmitAgentTelemetryFn } from "../../runtime-types/agent-events.js";

/** Telemetry event names (payload-map keys); excludes session-projection events. */
type TelemetryEventType = keyof AgentEventPayloadMap;

export type { EmitAgentTelemetryFn } from "../../runtime-types/agent-events.js";

/** Minimal surface for unified agent telemetry emission. */
export interface AgentTelemetryEmitter {
  readonly id: string;
  dispatchEvent?: (event: AgentEvent) => void;
  getSessionData?(): { id: string } | null;
}

export interface EmitAgentTelemetryOptions {
  /** Override agentId (default: emitter.id) */
  agentId?: string;
  parentId?: string;
  /** Override sessionId (default: getSessionData()?.id ?? emitter.id) */
  sessionId?: string;
}

/** Bind {@link emitAgentTelemetry} to a managed agent or other emitter. */
export function createEmitTelemetryFn(emitter: AgentTelemetryEmitter): EmitAgentTelemetryFn {
  return (type, payload) => emitAgentTelemetry(emitter, type, payload);
}

/**
 * Unified telemetry emission helper.
 * Injects `ts` and `sessionId` when session data is available.
 */
export function emitAgentTelemetry<T extends TelemetryEventType>(
  emitter: AgentTelemetryEmitter,
  type: T,
  payload?: AgentEventPayloadMap[T],
  options?: EmitAgentTelemetryOptions
): void {
  if (!emitter.dispatchEvent) return;

  const sessionId = options?.sessionId ?? emitter.getSessionData?.()?.id ?? emitter.id;
  const body = (payload ?? {}) as AgentEventPayloadMap[T];

  emitter.dispatchEvent({
    type,
    ts: Date.now(),
    agentId: options?.agentId ?? emitter.id,
    parentId: options?.parentId,
    sessionId,
    payload: body,
  } as AgentEvent);
}
