/**
 * Typed payloads for {@link AgentEventType}.
 *
 * Wire shape uses `payload` (not a loose `data` bag). Field names for tools keep
 * existing snake_case keys (`tool_name`, `tool_call_id`) used by Event→Log and app timing.
 */

import type { AgentEventType } from "./agent-events.js";
import type { AgentRetryStrategy } from "./agent-retry.js";
import type { McpServerStatus } from "../agent/mcp/manager.js";

/** Explicit empty object for events with no fields. */
export type EmptyAgentEventPayload = Record<string, never>;

type PlanPhase = "off" | "planning" | "ready" | "executing" | "retro";

export type AgentEventPayloadMap = {
  "session:doc": {
    source?: string;
    length?: number;
    message?: string;
  };
  "session:memory": {
    memoryCount?: number;
    indexLength?: number;
  };
  "session:mcp": {
    configPath?: string;
    configLoadedFrom?: string;
    servers?: McpServerStatus[];
    toolCount?: number;
  };
  "session:skill": {
    count?: number;
    names?: string[];
  };
  "session:start": {
    cwd?: string;
  };
  "session:restore": {
    sessionId?: string;
    messageCount?: number;
    tokenEstimate?: number;
    planPhase?: PlanPhase;
    autoMode?: boolean;
  };
  "session:save-error": {
    target?: string;
    error?: string;
  };
  "prompt:submit": {
    prompt?: string;
    contextMessageCount?: number;
  };
  "prompt:before": {
    prompt?: string;
    hasTurnContext?: boolean;
  };
  "agent:thinking": EmptyAgentEventPayload;
  "agent:tool-start": {
    tool_name?: string;
    tool_call_id?: string;
    tool_input?: unknown;
    timestamp?: number;
  };
  "agent:tool-approval-request": {
    tool_name?: string;
    tool_call_id?: string;
    approval_id?: string;
    tool_input?: unknown;
  };
  "agent:tool-approval-resolved": {
    tool_name?: string;
    tool_call_id?: string;
    approval_id?: string;
    decision: "approved" | "denied";
    reason?: string;
  };
  "agent:tool-end": {
    tool_name?: string;
    tool_call_id?: string;
    duration_ms?: number;
    tool_output?: unknown;
    timestamp?: number;
  };
  "agent:tool-error": {
    tool_name?: string;
    tool_call_id?: string;
    error?: string;
    timestamp?: number;
  };
  "agent:abort": {
    reason?: string;
  };
  "agent:retry": {
    attempt?: number;
    maxAttempts?: number;
    strategy?: AgentRetryStrategy;
    error?: string;
    delayMs?: number;
    retryAfterSeconds?: number;
  };
  "agent:stream-error": {
    error?: string;
  };
  "agent:stop": {
    reason?: string;
  };
  "agent:extension-error": {
    extensionId?: string;
    phase?: string;
    error?: string;
  };
  "memory:prefetch": {
    status?: string;
    count?: number;
    byteSize?: number;
    error?: string;
    filenames?: string[];
  };
  "memory:extract": {
    status?: string;
    count?: number;
    error?: string;
  };
  "memory:consolidate": {
    status?: string;
    before?: number;
    after?: number;
    count?: number;
    error?: string;
  };
  "llm:request": {
    model?: string;
    iteration?: number;
    messagesCount?: number;
    toolsCount?: number;
  };
  "llm:response": {
    model?: string;
    iteration?: number;
    finishReason?: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheHitTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    costUsd?: number;
    roundElapsedMs?: number;
    firstTokenMs?: number;
    durationMs?: number;
  };
  "turn:summary": {
    outcome?: "finished" | "aborted" | "error";
    llmCalls?: number;
    toolCalls?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd?: number;
    durationMs?: number;
  };
  "compaction:auto-start": {
    tokensBefore?: number;
  };
  "compaction:auto-complete": {
    tokensBefore?: number;
    tokensAfter?: number;
  };
  "compaction:auto-error": {
    phase?: string;
    error?: string;
  };
  "compaction:reactive-start": {
    retry?: number;
    maxRetries?: number;
  };
  "compaction:reactive-complete": {
    originalCount?: number;
    compactedCount?: number;
    tokensBefore?: number;
    tokensAfter?: number;
  };
  "compaction:reactive-error": {
    phase?: string;
    error?: string;
  };
  "compaction:reactive-max-retries": EmptyAgentEventPayload;
  "subagent:created": {
    subagentId?: string;
  };
  "subagent:started": {
    subagentId?: string;
    description?: string;
  };
  "subagent:completed": {
    subagentId?: string;
    summary: string;
    iterations?: number;
    durationMs?: number;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  "subagent:error": {
    subagentId?: string;
    error?: string;
  };
  "subagent:destroyed": {
    subagentId?: string;
  };
  "subagent:phase": {
    subagentId?: string;
    /** Task-level phase: running (exploring) or summary (report streaming). */
    phase?: "running" | "summary";
    parentTaskToolCallId?: string;
  };
  "subagent:ui-update": {
    subagentId?: string;
    messageCount?: number;
  };
  "subagent:progress-summary-error": {
    subagentId?: string;
    parentAgentId?: string;
    error?: string;
  };
  "plan:enter": {
    phase?: PlanPhase;
  };
  "plan:ready": {
    phase?: PlanPhase;
    stepCount?: number;
    preservedExistingTodos?: boolean;
    todosSeeded?: boolean;
    planFilePath?: string | null;
  };
  "plan:execute": {
    phase?: PlanPhase;
    stepCount?: number;
    replacedExistingTodos?: boolean;
    planFilePath?: string | null;
  };
  "plan:cancel-execution": {
    phase?: PlanPhase;
    stepCount?: number;
  };
  "plan:todo-replaced": {
    stepCount?: number;
  };
  "plan:retro": {
    phase?: PlanPhase;
    stepCount?: number;
    planFilePath?: string | null;
  };
  "plan:complete": {
    phase?: PlanPhase;
    planFilePath?: string | null;
    stepCount?: number;
  };
  "plan:exit": {
    phase?: PlanPhase;
  };
};

export type AgentEventPayload<T extends AgentEventType> = AgentEventPayloadMap[T];

/** Compile-time completeness check against {@link AgentEventType}. */
type _MissingPayloadKeys = Exclude<AgentEventType, keyof AgentEventPayloadMap>;
type _AssertPayloadMapComplete = [_MissingPayloadKeys] extends [never] ? true : _MissingPayloadKeys;
const _payloadMapComplete: _AssertPayloadMapComplete = true;
void _payloadMapComplete;
