/**
 * Compaction helpers for {@link ManagedAgent} (reactive + manual `/compact`).
 */

import { convertMessagesToModelMessages } from "@tanstack/ai";

import { applyCompactionResult, applyReactiveCompactionResult } from "../agent/compaction/apply-compaction-result.js";
import { autoCompact } from "../agent/compaction/auto-compact.js";
import { keepPolicyProjectionOptions, resolveKeepPolicy } from "../agent/compaction/keep-policy.js";
import { getModelVisibleMessages } from "../agent/compaction/message-chain-projection.js";
import { isPromptTooLongError, reactiveCompact } from "../agent/compaction/reactive-compact.js";
import { estimateTokens } from "../agent/compaction/token-estimator.js";

import type { AgentManager } from "./agent-manager.js";
import type { AgentStatusController } from "./controllers/agent-status-controller.js";
import type { CompactionService } from "./services/compaction-service.js";
import type { EmitAgentTelemetryFn } from "./telemetry/emit-agent-telemetry.js";
import type { UsageTracker } from "./telemetry/usage-tracker.js";
import type { AgentLog } from "../agent/agent-log/agent-log.js";
import type { CompactionConfig } from "../agent/compaction/types.js";
import type { TodoManager } from "../agent/todo";
import type { AgentUIChannel } from "../agent/ui-channel.js";
import type { AgentStatus } from "../runtime-types/agent-status.js";
import type { ModelMessage, UIMessage as TanStackUIMessage } from "@tanstack/ai";

export interface ReactiveCompactHost {
  id: string;
  parentId?: string;
  ui?: AgentUIChannel;
  usage: UsageTracker;
  compaction: CompactionService;
  statusController: AgentStatusController;
  getCanonicalFromUI: () => ModelMessage[];
  getMessagesForLLM: (canon?: ModelMessage[]) => ModelMessage[];
  emitEvent: EmitAgentTelemetryFn;
  resetAdmittedTurnContext?: () => void;
  compactionConfig?: { keepRecentTokens?: number } | null;
  /** Model input context window in tokens, if known (drives the reactive tail budget). */
  contextWindow?: number;
}

export async function handleManagedReactiveCompact(
  host: ReactiveCompactHost,
  error: unknown,
  manager: AgentManager
): Promise<boolean> {
  if (host.parentId) return false;
  if (!isPromptTooLongError(error)) return false;
  if (!host.compaction.canRetryReactiveCompact()) {
    host.emitEvent("compaction:reactive-max-retries");
    return false;
  }

  const channel = host.ui;
  if (!channel) return false;

  const retry = host.compaction.recordReactiveCompactRetry();

  try {
    host.statusController.beginCompaction("reactive", {
      retry,
      maxRetries: host.compaction.getMaxReactiveCompactRetries(),
    });
    const canon = host.getCanonicalFromUI();
    const llmMessages = host.getMessagesForLLM(canon);
    const compactedMessages = await reactiveCompact(llmMessages, host.id, manager, {
      ...(host.compactionConfig?.keepRecentTokens != null
        ? { keepRecentTokens: host.compactionConfig.keepRecentTokens }
        : {}),
      ...(host.contextWindow && host.contextWindow > 0 ? { contextWindow: host.contextWindow } : {}),
    });

    // Capture window fill before apply (usage is reset by applyReactiveCompactionResult).
    const tokensBefore = host.usage.getWindowUsage().inputTokens ?? 0;

    applyReactiveCompactionResult(canon, channel, host.usage, compactedMessages, {
      ...keepPolicyProjectionOptions(resolveKeepPolicy(host.compactionConfig ?? {}, host.contextWindow)),
      onCacheCleanupError: (err) => {
        host.emitEvent("compaction:reactive-error", {
          phase: "cache-cleanup",
          error: err.message,
        });
      },
    });
    host.resetAdmittedTurnContext?.();

    host.emitEvent("compaction:reactive-complete", {
      originalCount: llmMessages.length,
      compactedCount: compactedMessages.length,
      tokensBefore,
      tokensAfter: host.usage.getWindowUsage().inputTokens ?? 0,
    });

    host.statusController.endCompaction();
    return true;
  } catch (err) {
    const compactError = err instanceof Error ? err : new Error(String(err));
    host.emitEvent("compaction:reactive-error", { error: compactError.message });
    // Restore the status after beginCompaction above — otherwise the agent would
    // stay stuck in "compacting" (onRecoveryRetry only unwinds "error"), blocking
    // the stream-recovery loop's other strategies (capability / transient).
    host.statusController.endCompaction();
    return false;
  }
}

// ============================================================================
// Manual compact (`/compact` / AgentSession `compact`)
// ============================================================================

export interface ManualCompactHost {
  id: string;
  status: AgentStatus;
  setStatus: (status: AgentStatus, trigger?: string) => void;
  ui?: AgentUIChannel;
  usage: UsageTracker;
  todoManager: TodoManager | null;
  statusController: AgentStatusController;
  compactionConfig: CompactionConfig | null;
  /** Model input context window in tokens, if known (drives the keep policy). */
  contextWindow?: number;
  resetAdmittedTurnContext: () => void;
  resetSystemPrompt: () => void;
  persistSession: () => void;
  maybeSaveSessionUIMessages: (messages: TanStackUIMessage[], reason: "force") => void;
  getLog?: () => AgentLog | null;
}

export type ManualCompactResult =
  { ok: true; message: string; tokensBefore?: number; tokensAfter?: number } | { ok: false; error: string };

/**
 * Run the same autoCompact path as the app `/compact` command.
 */
export async function runManualCompact(
  host: ManualCompactHost,
  manager: AgentManager,
  options?: { focus?: string; messages?: TanStackUIMessage[] }
): Promise<ManualCompactResult> {
  const channel = host.ui;
  if (!channel) {
    return { ok: false, error: "Agent UI channel not available" };
  }

  if (options?.messages?.length) {
    channel.setMessages(options.messages);
  }

  const allModelMessages = convertMessagesToModelMessages(channel.getMessages());
  const keepOptions = keepPolicyProjectionOptions(resolveKeepPolicy(host.compactionConfig ?? {}, host.contextWindow));
  const messages = getModelVisibleMessages(allModelMessages, keepOptions);
  if (messages.length === 0) {
    return { ok: false, error: "No messages to compact" };
  }

  const incompleteTodos = host.todoManager?.getIncompleteTodos() ?? [];
  const todos = incompleteTodos.map((t) => ({
    content: t.content,
    status: t.status as "pending" | "in_progress" | "completed",
    priority: t.priority as "high" | "medium" | "low",
  }));

  const previousStatus = host.status;
  const tokensBeforeEstimate = estimateTokens(messages);
  const actualTokens = host.usage.getWindowUsage().inputTokens ?? 0;

  host.statusController.beginCompaction();

  try {
    const result = await autoCompact(messages, host.compactionConfig || {}, host.id, manager, {
      focus: options?.focus,
      todos: todos.length > 0 ? todos : undefined,
      actualTokens: actualTokens || undefined,
      contextWindow: host.contextWindow,
    });

    const applied = applyCompactionResult(allModelMessages, channel, host.usage, result, {
      ...keepOptions,
      onCacheCleanupError: (err) => {
        host.getLog?.()?.warn("agent", "Failed to cleanup tool cache after compact", { error: err.message });
      },
    });

    if (!applied) {
      if (result.error) {
        return { ok: false, error: result.error };
      }
      return {
        ok: true,
        message:
          "Nothing to compact — not enough older conversation to summarize (reduce keepRecentTokens or add more history).",
      };
    }

    host.resetAdmittedTurnContext();
    host.resetSystemPrompt();
    host.persistSession();
    host.maybeSaveSessionUIMessages(channel.getMessages(), "force");

    const tokensBefore = result.tokensBefore ?? tokensBeforeEstimate;
    const tokensAfter = result.tokensAfter;
    const compressionRatio = tokensBefore > 0 ? Math.round((1 - tokensAfter / tokensBefore) * 100) : 0;
    const todoNote = incompleteTodos.length > 0 ? ` (${incompleteTodos.length} todos preserved)` : "";

    return {
      ok: true,
      message: `Compacted: ${tokensBefore} → ${tokensAfter} tokens (${compressionRatio}% reduction)${todoNote}`,
      tokensBefore,
      tokensAfter,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { ok: false, error: `Compaction failed: ${err.message}` };
  } finally {
    if (previousStatus === "compacting") {
      host.statusController.endCompaction();
    } else {
      host.setStatus(previousStatus);
    }
  }
}
