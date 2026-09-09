/**
 * Prepare / finalize / abort run lifecycle for {@link ManagedAgent}.
 */

import { type UIMessage as TanStackUIMessage, type ModelMessage } from "@tanstack/ai";

import { getLatestUserMessage } from "../agent/compaction/message-utils.js";
import { isToolContinuationPrepare } from "../agent/stream/tool-phase-utils.js";

import type { AgentManager } from "./agent-manager.js";
import type { AgentStatus, RunFinalizeReason } from "./agent-types.js";
import type { RunCoordinator } from "./run-coordinator.js";
import type { CompactionService } from "./services/compaction-service.js";
import type { MemoryService } from "./services/memory-service.js";
import type { EmitAgentTelemetryFn } from "./telemetry/emit-agent-telemetry.js";
import type { UsageTracker } from "./telemetry/usage-tracker.js";
import type { AgentLog } from "../agent/agent-log";
import type { AgentUIChannel } from "../agent/ui-channel.js";
import type { TextAdapterConfig } from "../models/adapter/adapter-factory.js";

/**
 * Narrow interface capturing only the methods/fields lifecycle helpers need.
 * ManagedAgent structurally satisfies this via its public API surface.
 * This prevents lifecycle helpers from depending on the full ManagedAgent class.
 */
export interface RunLifecycleHost {
  readonly id: string;
  parentId?: string;
  status: AgentStatus;
  setStatus: (status: AgentStatus) => void;
  /** Track the active run id (log run-scoping); pass null to clear. */
  setCurrentRunId: (runId: string | null) => void;
  recordStreamDuration: () => void;
  consumePrepareAsContinuation: () => boolean;
  clearPrepareAsContinuation: () => void;
  beginTurnFinalize: () => boolean;
  getStreamStartedAt: () => number;
  setStreamStartedAt: (value: number) => void;
  persistSession: () => void;
  clearTurnContext: () => void;
  getMessagesForLLM: (canon?: ModelMessage[]) => ModelMessage[];
  collectExtensionPromptHooks: (prompt: string) => Promise<void>;
  emitEvent: EmitAgentTelemetryFn;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  log: AgentLog | null;
  usage: UsageTracker;
  ui?: AgentUIChannel;
  run: RunCoordinator;
  compaction: CompactionService;
  memory: MemoryService;
}

export async function prepareManagedAgentForRun(
  host: RunLifecycleHost,
  options: {
    prompt?: string;
    messages?: Array<TanStackUIMessage | ModelMessage>;
    abortSignal?: AbortSignal;
  }
): Promise<void> {
  const inputMessages = options.messages || [];

  host.run.setupAbortController(options.abortSignal, {
    onAborted: () => {
      host.setStatus("aborted");
    },
  });
  host.compaction.resetReactiveCompactRetries();

  // Always consume the flag (avoid `||` short-circuit leaving a stale continuation mark).
  const flaggedContinuation = host.consumePrepareAsContinuation() === true;
  const isToolContinuation = isToolContinuationPrepare(host.status, options.messages) || flaggedContinuation;
  if (!isToolContinuation || host.getStreamStartedAt() === 0) {
    host.setStreamStartedAt(Date.now());
  }

  // Run scope: one short id per user turn (tool continuations keep the same id).
  if (!isToolContinuation) {
    const runId = Math.random().toString(36).slice(2, 10);
    host.setCurrentRunId(runId);
    host.log?.setRun(runId);
  }

  if (!isToolContinuation && !host.parentId) {
    await host.memory.prefetchRelevantMemories({
      messages:
        getLatestUserMessage(options.prompt ? [{ role: "user", content: options.prompt }] : inputMessages) || [],
      usage: host.usage,
      log: host.log,
      resolveTextAdapter: host.resolveTextAdapter,
      emitEvent: (type, data) => host.emitEvent(type, data),
      // Let abort interrupt the memory-selection LLM side-query during prerun.
      abortSignal: host.run.currentAbortController?.signal,
    });

    // Extension hooks once per user turn — consumed by the turn-context middleware
    // at onConfig (injection happens after compaction, against the real wire payload).
    await host.collectExtensionPromptHooks(typeof options.prompt === "string" ? options.prompt : "(structured)");

    const userMsg = typeof options.prompt === "string" ? options.prompt : "(structured)";
    host.emitEvent("prompt:submit", {
      prompt: userMsg,
      contextMessageCount: (host.ui?.getMessages() ?? inputMessages).length,
    });
  }
}

export function finalizeManagedAgentRun(
  host: RunLifecycleHost,
  manager: AgentManager,
  reason: RunFinalizeReason
): void {
  // Idempotent per turn — pump `stop()` and outcome paths may both attempt finalize.
  if (!host.beginTurnFinalize()) return;

  host.clearPrepareAsContinuation();
  host.recordStreamDuration();
  host.persistSession();
  host.clearTurnContext();
  if (reason === "finished") {
    host.memory.runExtraction({
      agentId: host.id,
      getMessagesForLLM: () => host.getMessagesForLLM(),
      log: host.log,
      manager,
      emitEvent: (type, data) => host.emitEvent(type, data),
    });
  }
  host.emitEvent("agent:stop", { reason });
  host.setCurrentRunId(null);
  host.log?.setRun(null);
}

export function abortManagedAgentRun(host: RunLifecycleHost, reason?: string): void {
  host.emitEvent("agent:abort", { reason: reason ?? "(no reason)" });
  host.run.abort(reason ?? "user-cancelled");
  if (host.status !== "aborted" && host.status !== "idle" && host.status !== "completed") {
    host.setStatus("aborted");
  }
}
