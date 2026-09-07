/**
 * Cycle agent mode via Session dispatch: normal → auto → plan → normal.
 */

import type { AgentSession } from "@my-agent/core";

export function cycleAgentMode(session: AgentSession | null | undefined): void {
  if (!session) return;
  void session.dispatch({ type: "mode.toggle" });
}
