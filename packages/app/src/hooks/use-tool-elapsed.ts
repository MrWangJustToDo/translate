/**
 * use-tool-elapsed — Read tool elapsed time from the global timing store.
 *
 * No subscription or bridge logic here — that lives in `use-agent-chat.ts`.
 * This hook is purely a store reader with a live ticker for in-flight tools.
 *
 * Client tools that wait on the user (e.g. `ask_user`) are excluded from timing
 * at the store level (see {@link handleToolLifecycleEvent}).
 */

import { useEffect, useState } from "react";

import { useToolTimingStore } from "../utils/tool-timing-store.js";

// ============================================================================
// Constants
// ============================================================================

/** Live-clock tick interval for in-flight tools (ms). */
const TICK_MS = 200;

// ============================================================================
// Hook
// ============================================================================

/**
 * Read the elapsed time for a tool call.
 *
 * @param toolCallId - Tool call ID, or empty to disable.
 * @param active - Whether the tool is currently in flight (drives the live tick).
 * @param thresholdMs - Only return a live value once elapsed exceeds this (mirrors
 *   the old `LIVE_DURATION_THRESHOLD_MS` behavior). Final durations always return.
 * @returns Live elapsed ms while `active`, final `durationMs` once completed,
 *   otherwise `null`.
 */
export function useToolElapsed(toolCallId: string | undefined, active: boolean, thresholdMs = 0): number | null {
  const timing = useToolTimingStore((s) => (toolCallId ? s.timings[toolCallId] : undefined));

  // Live tick for in-flight tools (only while active; no persistent interval otherwise).
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active || !toolCallId) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [active, toolCallId]);

  // Completed tool: return the frozen authoritative duration.
  if (timing?.durationMs !== undefined) {
    return timing.durationMs;
  }

  // In-flight tool: return live elapsed once past threshold.
  if (active && timing?.startedAt) {
    const elapsed = (now || timing.startedAt) - timing.startedAt;
    if (elapsed >= thresholdMs) return elapsed;
  }

  return null;
}
