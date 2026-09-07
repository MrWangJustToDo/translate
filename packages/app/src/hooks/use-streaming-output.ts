/**
 * use-streaming-output — React hook for subscribing to real-time tool output.
 *
 * Uses reactivity-store for automatic UI updates. Throttling is applied at the
 * consumer via {@link UseStreamingOutputOptions.throttleMs}.
 */

import { useEffect } from "react";

import { resolveAgentSession } from "../utils/session-resolve.js";
import { clearStreamingIngest, ingestStreamingChunk, registerStreamingThrottle } from "../utils/streaming-ingest.js";

import { useAgent } from "./use-agent.js";
import { useStreamingStore } from "./use-streaming-store.js";

import type { StreamingOutput } from "./use-streaming-store.js";

// ============================================================================
// Types
// ============================================================================

export interface UseStreamingOutputOptions {
  /** Whether to subscribe (default: true). */
  enabled?: boolean;
  /**
   * Minimum ms between reactive store updates for this tool call.
   * `0` flushes every chunk (default).
   */
  throttleMs?: number;
  /** Override agent scope; defaults to the current root agent from {@link useAgent}. */
  agentId?: string;
}

// ============================================================================
// Bridge (ref-counted per agentId — one store bridge, many hook consumers)
// ============================================================================

const bridges = new Map<
  string,
  {
    refCount: number;
    unsubscribe: () => void;
  }
>();

function acquireStreamingBridge(agentId: string): boolean {
  const existing = bridges.get(agentId);
  if (existing) {
    existing.refCount += 1;
    return true;
  }

  const session = resolveAgentSession(agentId);
  if (!session) return false;

  const unsubscribe = session.subscribe(
    (event) => {
      if (event.channel !== "tool") return;
      if (event.payload.kind === "chunk") {
        const { toolCallId, type, chunk } = event.payload.chunk;
        ingestStreamingChunk(toolCallId, type, chunk);
        return;
      }
      clearStreamingIngest(event.payload.toolCallId);
    },
    { channels: ["tool"] }
  );

  bridges.set(agentId, {
    refCount: 1,
    unsubscribe,
  });
  return true;
}

function releaseStreamingBridge(agentId: string): void {
  const existing = bridges.get(agentId);
  if (!existing) return;
  existing.refCount -= 1;
  if (existing.refCount > 0) return;
  existing.unsubscribe();
  bridges.delete(agentId);
}

function resolveOptions(options?: boolean | UseStreamingOutputOptions): {
  enabled: boolean;
  throttleMs: number;
  agentId?: string;
} {
  if (typeof options === "boolean") {
    return { enabled: options, throttleMs: 0 };
  }
  return {
    enabled: options?.enabled ?? true,
    throttleMs: options?.throttleMs ?? 0,
    agentId: options?.agentId,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Subscribe to streaming output for a tool call.
 *
 * @param toolCallId - The tool call ID to subscribe to
 * @param options - `enabled`, `throttleMs`, and/or `agentId`
 */
export function useStreamingOutput(
  toolCallId: string | undefined,
  options?: boolean | UseStreamingOutputOptions
): StreamingOutput | undefined {
  const { enabled, throttleMs, agentId: agentIdOption } = resolveOptions(options);
  const rootAgentId = useAgent((s) => s.session?.id);
  const agentId = agentIdOption || rootAgentId;
  const output = useStreamingStore((state) => (toolCallId ? state.outputs[toolCallId] : undefined));

  useEffect(() => {
    if (!enabled || !agentId) return;
    if (!acquireStreamingBridge(agentId)) return;
    return () => {
      releaseStreamingBridge(agentId);
    };
  }, [enabled, agentId]);

  useEffect(() => {
    if (!enabled || !toolCallId) return;
    return registerStreamingThrottle(toolCallId, throttleMs);
  }, [enabled, toolCallId, throttleMs]);

  // Do not clear ingest on unmount. MessageList rebuilds / task phase toggles can
  // remount this view while the producer still tracks streamedSummaryLength —
  // wiping the buffer leaves an empty window until the next delta (indicator flicker).
  // Clears come from core `clearStreamingOutput` → streaming clear events only.

  return output;
}
