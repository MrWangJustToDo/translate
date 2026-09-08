/**
 * Worker-profile runner — spawns and executes context-isolated subagents.
 * Uses shared `runAgentOnce` for stream consume + detached outcome.
 */

import { generateId } from "../../utils/generate-id.js";
import { ensureUIChannel, runAgentOnce } from "../run/run-agent-skeleton.js";
import { extractAssistantText } from "../stream/extract-assistant-text.js";
import { throwOnRunError } from "../stream/stream-errors.js";
import { summaryStreamKey } from "../summary-stream";

import { buildExploreSystemPrompt } from "./explore-prompt.js";
import { isProgressSummaryEligible, summarizeProgress } from "./progress-summary.js";
import { captureStreamFinishReason, deriveSubagentRunStats, hasBeginSummaryCall } from "./run-stats.js";
import { applySubagentCancelNotice, truncateSummary } from "./subagent-output.js";
import { beginTaskRun, enterTaskSummaryPhase } from "./task-run-state.js";
import { resolveSubagentBridgeUI, SUBAGENT_DEFAULT_MAX_ITERATIONS } from "./types.js";

import type { SubagentConfig, SubagentResult } from "./types.js";
import type { AgentManager } from "../../runtime-types/hosts.js";
import type { ModelMessage, StreamChunk, UIMessage as TanStackUIMessage, UIMessage } from "@tanstack/ai";

export interface SubagentRunDeps {
  manager: AgentManager;
}

/**
 * Runs a subagent with fresh context to complete a delegated task.
 */
export async function runSubagent(config: SubagentConfig, deps: SubagentRunDeps): Promise<SubagentResult> {
  return executeSubagentRun(config, deps.manager);
}

/**
 * Get a subagent instance by ID.
 */
export function getSubagent(manager: AgentManager, subagentId: string) {
  return manager.getAgent(subagentId);
}

/**
 * Map a {@link SubagentResult} to the `task` tool output shape (summary field).
 * Used by the pre-fork middleware to mirror finished runs into the UI early.
 */
export function subagentResultToTaskOutput(result: SubagentResult) {
  return {
    subagentId: result.subagentId,
    summary: result.output,
    truncated: result.truncated,
    iterations: result.iterations,
    durationMs: result.durationMs,
    usage: result.usage,
    reachedLimit: result.reachedLimit,
    incomplete: result.incomplete,
    aborted: result.aborted,
    success: !result.aborted && !result.incomplete,
  };
}

/**
 * Destroy a subagent by ID.
 */
export function destroySubagent(manager: AgentManager, subagentId: string) {
  manager.destroyAgent(subagentId);
}

async function executeSubagentRun(config: SubagentConfig, manager: AgentManager): Promise<SubagentResult> {
  const {
    subagentId: customId,
    prompt,
    description = "subtask",
    parentAgentId,
    parentTaskToolCallId,
    systemPrompt: customSystemPrompt,
    tools: customTools,
    maxIterations = SUBAGENT_DEFAULT_MAX_ITERATIONS,
    maxOutputLength,
    abortSignal,
    autoDestroy = true,
    aggregateUsageToParent = true,
    initialMessages,
    compactSummaryStream,
  } = config;

  const bridgeUI = resolveSubagentBridgeUI(config);
  const subagentId = customId ?? generateId("subagent", { exists: (id) => manager.getAgent(id) != null });
  const systemPrompt = customSystemPrompt ?? buildExploreSystemPrompt(maxIterations);

  const parentManaged = manager.getAgent(parentAgentId);
  if (!parentManaged) {
    throw new Error(`Parent agent not found: ${parentAgentId}`);
  }

  const subagent = await manager.spawnSubagent(parentAgentId, {
    id: subagentId,
    name: `subagent-${description}`,
    systemPrompt,
    maxIterations,
    subagentTools: customTools,
  });

  // link task to agent, for unstable input
  subagent.parentTaskId = parentTaskToolCallId;

  // Task-level phase machine: authoritative running → summary transitions.
  if (parentTaskToolCallId) {
    beginTaskRun(parentManaged, parentTaskToolCallId);
  }

  const subagentManaged = manager.getAgent(subagentId);
  if (!subagentManaged) {
    throw new Error(`Subagent not found: ${subagentId}`);
  }

  // Any throw after spawn (stream failure, finalize error, summarizer crash) must
  // not leave the subagent registered when autoDestroy was requested.
  let subagentRunCompleted = false;
  const runStartedAt = Date.now();
  try {
    const messages: ModelMessage[] = [...(initialMessages ?? []), { role: "user", content: prompt }];

    const userUIMessage: TanStackUIMessage = {
      id: generateId("msg"),
      role: "user",
      parts: [{ type: "text", content: prompt }],
      createdAt: new Date(),
    };

    // Always attach a channel (durable message SoT). bridgeUI only gates parent panel streaming.
    // Context injection is handled by the shared turn-context middleware (subagent kind
    // whitelist: current_date / git_status / project_instructions) — no manual seed here.
    const channel = ensureUIChannel(subagentManaged, {
      initialMessages: [userUIMessage],
    });

    const summaryHub = bridgeUI || compactSummaryStream ? parentManaged.summaryStreams : undefined;
    const compactId = compactSummaryStream?.compactId;
    const compactLabel = compactSummaryStream?.label;
    const compactEpoch = compactSummaryStream?.epoch;

    /** One-way running → summary transition + telemetry (no-op once in summary). */
    const enterSummaryPhase = () => {
      if (!parentTaskToolCallId) return;
      if (enterTaskSummaryPhase(parentManaged, parentTaskToolCallId)) {
        subagent.emitEvent(
          "subagent:phase",
          { subagentId, phase: "summary", parentTaskToolCallId },
          { parentId: parentAgentId }
        );
      }
    };

    subagent.emitEvent("subagent:created", { subagentId }, { parentId: parentAgentId });
    subagent.emitEvent("subagent:started", { subagentId, description }, { parentId: parentAgentId });

    subagentManaged.resetTurnLifecycle();

    let output = "(no summary)";
    let aborted = false;
    let finishReason: string | null = null;
    let previewMessages: UIMessage[] = [];

    try {
      // Same-epoch follow-up pass: continue the banner with a phase separator
      // instead of resetting it (the channel skips its reset for same epochs).
      if (summaryHub && compactId && compactEpoch) {
        const key = summaryStreamKey("compact", compactId);
        if (summaryHub.getSnapshot(key)?.epoch === compactEpoch) {
          summaryHub.append(key, compactLabel ? `\n\n[${compactLabel}]\n` : "\n\n", { epoch: compactEpoch });
        }
      }

      const result = await runAgentOnce({
        manager,
        agentId: subagentId,
        messages,
        abortSignal,
        channel,
        parentTaskToolCallId: bridgeUI ? parentTaskToolCallId : undefined,
        streamingAgentId: bridgeUI ? parentAgentId : undefined,
        summaryHub,
        compactId,
        compactLabel,
        compactEpoch,
        onUpdate: bridgeUI
          ? (updated) => {
              subagentManaged.emitEvent(
                "subagent:ui-update",
                { subagentId, messageCount: updated.length },
                { parentId: parentAgentId }
              );
            }
          : undefined,
        transformStream: (stream) =>
          throwOnRunError(
            captureStreamFinishReason(
              tapTextDeltas(
                tapBeginSummary(stream, parentTaskToolCallId ? () => enterSummaryPhase() : undefined),
                config.onTextDelta
              ),
              (reason) => {
                finishReason = reason;
              }
            )
          ),
        // Outcome applied below — abort ends the stream without throwing, so we must
        // not hardcode `finished` (that would clobber `aborted` / skip cancel notice).
      });
      previewMessages = result.messages;
      output = extractAssistantText(previewMessages)?.trim() || "(no summary)";
    } catch (err) {
      const managed = manager.getAgent(subagentId);
      if (managed?.status === "aborted" || managed?.isAbortError(err)) {
        aborted = true;
        previewMessages = channel?.getMessages() ?? previewMessages;
        output = extractAssistantText(previewMessages)?.trim() || "(no summary)";
      } else {
        // Non-abort failure: clear the subagent's partial history and roll the
        // task-tool phase back out of `summary` so the preview does not linger on
        // stale tool rows / summary text after a failed run.
        try {
          channel.failRun();
        } catch {
          // ignore cleanup errors while propagating the run failure
        }
        try {
          subagentManaged.finalizeRun(manager, "error");
        } catch {
          // ignore finalize errors while propagating the run failure
        }
        throw err;
      }
    }

    // Esc → managed.abort() sets status during consume; stream often completes without throw.
    aborted =
      aborted ||
      subagentManaged.status === "aborted" ||
      Boolean(subagentManaged.run.currentAbortController?.signal.aborted);

    const outcomeKind = aborted ? "aborted" : "finished";
    subagentManaged.statusController.applyRunOutcome({
      kind: outcomeKind,
      messages: previewMessages,
      path: "detached",
    });
    subagentManaged.finalizeRun(manager, outcomeKind);
    const noticed = applySubagentCancelNotice(output, aborted);
    let { summary: finalOutput, truncated } = truncateSummary(noticed, maxOutputLength);

    const runStats = deriveSubagentRunStats({
      messages: previewMessages,
      maxIterations,
      finishReason,
      output: finalOutput,
      aborted,
      status: subagentManaged.status,
    });

    // Snapshot status flags BEFORE the progress-summary fallback. The fallback may
    // replace the output text, but it must NEVER change the subagent's status
    // semantics: a step-budget cutoff stays reachedLimit=true + incomplete=true
    // even after a progress report replaces the empty output. Returning these
    // snapshots (not re-read runStats) keeps the contract explicit.
    const statusFlags = {
      iterations: runStats.iterations,
      reachedLimit: runStats.reachedLimit,
      incomplete: runStats.incomplete,
    };

    // Fallback: when the subagent hit the iteration budget before writing a final
    // answer (reachedLimit + incomplete), spawn a parent-owned summarizer that
    // distills the execution trace into a structured progress report. This also
    // covers the mid-tool-loop cutoff: output may hold exploration narration
    // ("Let me do a final check…") but without a `begin_summary` call it is not a
    // final answer. Failure is silent — the original output is kept unchanged.
    //
    // Gated to exploration subagents (default explore tools). Compaction / memory
    // summarizer subagents pass `tools: {}` — never fall back for them, or the
    // fallback would recursively spawn yet another summarizer.
    if (
      !customTools &&
      isProgressSummaryEligible(
        statusFlags.incomplete,
        statusFlags.reachedLimit,
        finalOutput,
        hasBeginSummaryCall(previewMessages)
      )
    ) {
      // Mirror generation into the task summary UI: the phase machine flips to
      // `summary` and the hub reset switches the panel to its summary view;
      // deltas stream live; end settles the view. Without this the report
      // would only appear after the whole side-LLM pass finishes.
      enterSummaryPhase();
      const hub = parentTaskToolCallId ? parentManaged.summaryStreams : undefined;
      if (hub && parentTaskToolCallId) {
        hub.reset({ source: "task", toolCallId: parentTaskToolCallId });
      }
      const summaryKey = parentTaskToolCallId ? summaryStreamKey("task", parentTaskToolCallId) : "";
      const onDelta = hub ? (delta: string) => hub.append(summaryKey, delta) : undefined;
      const progressSummary = await summarizeProgress(
        previewMessages,
        parentAgentId,
        manager,
        prompt,
        onDelta ? { onDelta } : undefined,
        (error) =>
          subagent.emitEvent(
            "subagent:progress-summary-error",
            { subagentId, parentAgentId, error },
            { parentId: parentAgentId }
          )
      );
      if (hub && parentTaskToolCallId) {
        hub.end(summaryKey);
      }
      if (progressSummary) {
        const truncatedResult = truncateSummary(progressSummary, maxOutputLength);
        finalOutput = truncatedResult.summary;
        truncated = truncatedResult.truncated;
      }
    }

    const usage = subagentManaged.usage.getTotal();
    const durationMs = Math.max(0, Date.now() - runStartedAt);

    if (aggregateUsageToParent && parentManaged) {
      parentManaged.usage.addTotal(usage);
    }

    subagent.emitEvent(
      aborted ? "subagent:error" : "subagent:completed",
      aborted
        ? { subagentId, error: finalOutput }
        : {
            subagentId,
            summary: finalOutput,
            iterations: statusFlags.iterations,
            durationMs,
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
            },
            // Flat token fields so the Event→Log entry keeps the numbers structured.
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
          },
      { parentId: parentAgentId }
    );

    if (autoDestroy) {
      manager.destroyAgent(subagentId);
    }

    subagentRunCompleted = true;
    return {
      subagentId,
      output: finalOutput,
      truncated,
      iterations: statusFlags.iterations,
      durationMs,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      },
      reachedLimit: statusFlags.reachedLimit,
      incomplete: statusFlags.incomplete,
      aborted,
    };
  } finally {
    if (!subagentRunCompleted && autoDestroy) {
      try {
        manager.destroyAgent(subagentId);
      } catch {
        // Cleanup must never mask the original failure.
      }
    }
  }
}

/**
 * Forward assistant text deltas to an observer while passing chunks through.
 * Used by the progress-summary fallback to mirror side-LLM output into the
 * task summary UI while it generates.
 */
async function* tapTextDeltas(
  stream: AsyncIterable<StreamChunk>,
  onTextDelta?: (delta: string) => void
): AsyncIterable<StreamChunk> {
  if (!onTextDelta) {
    yield* stream;
    return;
  }
  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && typeof chunk.delta === "string") {
      onTextDelta(chunk.delta);
    }
    yield chunk;
  }
}

/**
 * Flip the task phase machine to `summary` when the subagent calls
 * `begin_summary` — one-way, authoritative, no message re-scanning.
 */
async function* tapBeginSummary(
  stream: AsyncIterable<StreamChunk>,
  onBeginSummary?: () => void
): AsyncIterable<StreamChunk> {
  if (!onBeginSummary) {
    yield* stream;
    return;
  }
  for await (const chunk of stream) {
    if (chunk.type === "TOOL_CALL_START" && (chunk.toolName ?? chunk.toolCallName) === "begin_summary") {
      onBeginSummary();
    }
    yield chunk;
  }
}
