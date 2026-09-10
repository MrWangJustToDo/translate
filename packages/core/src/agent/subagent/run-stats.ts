/**
 * Derive subagent run statistics from UI message snapshots and stream metadata.
 */

import { splitStepSegments } from "../stream/extract-assistant-text.js";
import { isToolCallPart } from "../stream/message-parts.js";

import { BEGIN_SUMMARY_TOOL_NAME } from "./begin-summary-tool.js";

import type { SubagentResult } from "./types.js";
import type { AgentStatus } from "../../runtime-types/agent-status.js";
import type { StreamChunk, UIMessage } from "@tanstack/ai";

/**
 * Finish reasons that mean the model hit an output/token limit (not the agent
 * step budget). TanStack's {@link maxIterations} does **not** emit a dedicated
 * reason — step-budget cutoffs leave the last model reason (`tool_calls`).
 */
const OUTPUT_LIMIT_FINISH_REASONS = new Set(["length"]);

export interface DeriveSubagentRunStatsInput {
  messages: UIMessage[];
  maxIterations: number;
  finishReason: string | null;
  output: string;
  aborted: boolean;
  status?: AgentStatus;
}

/** Whether the subagent called {@link BEGIN_SUMMARY_TOOL_NAME} (explore natural end). */
export function hasBeginSummaryCall(messages: UIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (isToolCallPart(part) && part.name === BEGIN_SUMMARY_TOOL_NAME) return true;
    }
  }
  return false;
}

export function countSubagentToolCalls(messages: UIMessage[]): number {
  return messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "tool-call").length;
}

/**
 * Count agent-loop style rounds: each contiguous tool-call batch from one model
 * turn (parallel tools = 1 round). Falls back to text-only step segments.
 */
export function countSubagentIterations(messages: UIMessage[]): number {
  let rounds = 0;
  let sawAssistant = false;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    sawAssistant = true;

    let inToolCallBatch = false;
    for (const part of message.parts) {
      if (part.type === "tool-call") {
        if (!inToolCallBatch) {
          rounds++;
          inToolCallBatch = true;
        }
      } else if (part.type === "tool-result") {
        // End of a tool batch — next tool-call starts a new round (sequential turns).
        inToolCallBatch = false;
      } else {
        inToolCallBatch = false;
      }
    }
  }

  if (rounds > 0) return rounds;

  if (!sawAssistant) return 1;

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!lastAssistant) return 1;

  return Math.max(1, splitStepSegments(lastAssistant.parts).length);
}

/** Wrap a stream to capture {@link RUN_FINISHED} finish reason. */
export async function* captureStreamFinishReason(
  stream: AsyncIterable<StreamChunk>,
  onFinish: (reason: string | null) => void
): AsyncIterable<StreamChunk> {
  for await (const chunk of stream) {
    if (chunk.type === "RUN_FINISHED") {
      const record = chunk as { finishReason?: string };
      onFinish(record.finishReason ?? null);
    }
    yield chunk;
  }
}

export function deriveSubagentRunStats(
  input: DeriveSubagentRunStatsInput
): Pick<SubagentResult, "iterations" | "reachedLimit" | "incomplete"> {
  const iterations = countSubagentIterations(input.messages);
  const toolCalls = countSubagentToolCalls(input.messages);
  const finishReason = input.finishReason;
  const calledBeginSummary = hasBeginSummaryCall(input.messages);

  // TanStack `maxIterations(n)` stops the loop without rewriting finishReason.
  // When the step budget cuts off mid-tooling, the last model reason is typically `tool_calls`.
  // Fallback: an explore subagent that exhausted the budget WITHOUT ever calling
  // `begin_summary` cannot have finished naturally — some cutoffs end on a text
  // narration step (finishReason "stop"), which would otherwise hide the limit.
  const hitStepBudget =
    input.maxIterations > 0 &&
    (finishReason === "tool_calls" ||
      (!calledBeginSummary &&
        countSubagentToolCalls(input.messages) > 0 &&
        countSubagentIterations(input.messages) >= input.maxIterations));
  const reachedLimit = hitStepBudget;

  const hasSummary = input.output.trim().length > 0 && input.output !== "(no summary)";
  const hitOutputLimit = finishReason != null && OUTPUT_LIMIT_FINISH_REASONS.has(finishReason);

  let incomplete = false;
  if (!input.aborted) {
    if (!hasSummary) {
      incomplete = true;
    } else if (reachedLimit || hitOutputLimit || input.status === "error") {
      incomplete = true;
    } else if (toolCalls > 0 && !calledBeginSummary) {
      // Explore tools require begin_summary before a trustworthy final answer.
      // Headless runs with `tools: {}` (compaction/memory) never hit this branch.
      incomplete = true;
    }
  }

  return {
    iterations: Math.max(iterations, 1),
    reachedLimit,
    incomplete,
  };
}
