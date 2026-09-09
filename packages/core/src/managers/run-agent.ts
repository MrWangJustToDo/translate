import {
  getPlanModeToolExcludeSet,
  PLAN_AUTHORING_TOOL_NAMES,
  PLAN_COMPLETION_TOOL_NAMES,
} from "../agent/plan/plan-tools.js";
import { AgentRunner } from "../agent/runner/agent-runner.js";
import { assertAsyncIterable } from "../agent/stream/assert-async-iterable.js";
import { resolveToolsRecord, SUBAGENT_EXCLUDED_TOOL_NAMES } from "../agent/tools/runtime";
import { createTextAdapter } from "../models/adapter/adapter-factory.js";
import { resolvePromptCacheKey } from "../models/cache/prompt-cache.js";
import { DEFAULT_BASE_URLS } from "../models/config/model-config.js";

import { DEFAULT_AGENT_MAX_ITERATIONS } from "./agent-types.js";
import { buildManagedAgentDeps } from "./managed-agent-deps.js";
import {
  createApprovalResumeMiddleware,
  createBackgroundNotificationMiddleware,
  createCompactionMiddleware,
  createEarlyToolResultUiMiddleware,
  createExtensionsMiddleware,
  createLifecycleMiddleware,
  createPlanModeMiddleware,
  createPromptCacheMiddleware,
  createStatusMiddleware,
  createTaskPreforkMiddleware,
  createToolCompactMiddleware,
  createTurnContextMiddleware,
  instrumentMiddlewareLog,
} from "./middleware";
import { runStreamWithRecovery } from "./run-stream-recovery.js";
import { createEmitTelemetryFn } from "./telemetry/emit-agent-telemetry.js";

import type { AgentManager } from "./agent-manager.js";
import type { AgentRunDeps } from "./agent-run-deps.js";
import type { ManagedAgent } from "./managed-agent.js";
import type { TextAdapterConfig } from "../models/adapter/adapter-factory.js";
import type { ModelMessage, ServerTool, StreamChunk, UIMessage } from "@tanstack/ai";

// ============================================================================
// Run message selection
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export interface RunAgentStreamInput {
  messages?: Array<UIMessage | ModelMessage>;
  data?: Record<string, unknown>;
  forwardedProps?: Record<string, unknown>;
  prompt?: string;
  abortSignal?: AbortSignal;
  threadId?: string;
  runId?: string;
  parentRunId?: string;
}

// ============================================================================
// Text adapter resolution
// ============================================================================

export async function resolveTextAdapterForManaged(managed: ManagedAgent): Promise<TextAdapterConfig> {
  const cached = managed.getTextAdapter();
  if (cached) return cached;

  const { config } = managed;
  const style = config.modelStyle;
  if (!style) {
    throw new Error(
      `Agent "${managed.id}" has no modelStyle configured. Set modelStyle, modelBaseURL, and modelApiKey on createManagedAgent().`
    );
  }

  const adapter = createTextAdapter({
    style,
    model: config.model,
    baseURL: config.modelBaseURL ?? DEFAULT_BASE_URLS[style],
    apiKey: config.modelApiKey,
    modelInfo: managed.getModelInfo(),
  });
  managed.setTextAdapter(adapter);
  return adapter;
}

// ============================================================================
// TanStack tools
// ============================================================================

function resolveTanStackTools(managed: ManagedAgent): ServerTool[] {
  if (managed.parentId) {
    return resolveToolsRecord(managed.tools, { exclude: SUBAGENT_EXCLUDED_TOOL_NAMES }) as ServerTool[];
  }
  if (managed.planMode.isRestrictingTools()) {
    const exclude = getPlanModeToolExcludeSet(managed.tools);
    for (const name of PLAN_COMPLETION_TOOL_NAMES) exclude.add(name);
    return resolveToolsRecord(managed.tools, { exclude }) as ServerTool[];
  }
  if (managed.planMode.getPhase() === "retro") {
    // Retro: allow mutate tools + complete_plan; hide authoring tools
    return resolveToolsRecord(managed.tools, {
      exclude: PLAN_AUTHORING_TOOL_NAMES,
    }) as ServerTool[];
  }
  // Agent / executing / off: hide plan-authoring and complete_plan
  const exclude = new Set([...PLAN_AUTHORING_TOOL_NAMES, ...PLAN_COMPLETION_TOOL_NAMES]);
  return resolveToolsRecord(managed.tools, { exclude }) as ServerTool[];
}

function buildRunDeps(managed: ManagedAgent, manager: AgentManager): AgentRunDeps {
  return buildManagedAgentDeps(managed, manager);
}

// ============================================================================
// AgentRunner factory
// ============================================================================

export function buildAgentRunner(
  managed: ManagedAgent,
  textAdapter: TextAdapterConfig,
  manager: AgentManager
): AgentRunner {
  const deps = buildRunDeps(managed, manager);
  const systemPrompt = managed.getSystemPrompt();
  const emitEvent = createEmitTelemetryFn(managed);

  const middleware = [
    createStatusMiddleware({
      status: managed.statusController,
      onApprovalRequested: (approvalId, toolCallId) => {
        managed.approvals.upsert({ id: approvalId, toolCallId, status: "pending" });
      },
    }),
    createApprovalResumeMiddleware({
      getApprovals: () => managed.approvals.toArray(),
    }),
    createLifecycleMiddleware({
      usage: deps.usage,
      getPricing: () => deps.usage.getPricing(),
      onThinking: () => emitEvent("agent:thinking"),
      onFirstModelOutput: () => deps.memory.commitSurfacedMemories(),
      emitEvent,
      recordUsage: (input) => managed.usageHistory.record({ agentId: managed.id, ...input }),
    }),
    createCompactionMiddleware({
      agentId: deps.agentId,
      manager: deps.manager,
      getCompactionConfig: () => deps.compactionConfig,
      // Read live so late-arriving ModelInfo (models.dev lookup) stays in sync
      // with ManagedAgent.getMessagesForLLM's keep-policy resolution.
      getContextWindow: () => managed.getModelInfo()?.contextWindow,
      getUIChannel: () => deps.getUIChannel(),
      getUsage: () => deps.usage,
      getTodoManager: () => deps.todoManager,
      shouldTriggerAutoCompact: deps.shouldTriggerAutoCompact,
      status: managed.statusController,
      log: deps.log,
      emitEvent,
    }),
    createToolCompactMiddleware({
      getCompactionConfig: () => deps.compactionConfig,
      getToolCompactCache: () => managed.getToolCompactCache(),
      getManagedAgent: () => managed,
    }),
    createTurnContextMiddleware({
      getFrozenSystemPrompt: deps.getFrozenSystemPrompt,
      getSections: () => managed.getDynamicTurnContextSections(),
      getUIChannel: () => managed.ui,
      persistMessages: (next) => managed.maybeSaveSessionUIMessages(next, "user-message"),
      getManagedAgent: () => managed,
      // Subagents get the parent's agent doc (their own is not loaded).
      getProjectInstructions: () => {
        if (!managed.parentId) return undefined;
        return manager.getAgent(managed.parentId)?.getAgentDocContent() || undefined;
      },
      getAdmittedHashes: () => managed.getAdmittedContextHashes(),
      setAdmittedHashes: (hashes) => managed.setAdmittedContextHashes(hashes),
      getAdmitMessageCount: () => managed.getTurnContextAdmitMessageCount(),
      setAdmitMessageCount: (count) => managed.setTurnContextAdmitMessageCount(count),
    }),
    createExtensionsMiddleware({
      getExtensionRunner: () => deps.extensionRunner,
      getSessionId: () => deps.session.getSessionData()?.id ?? deps.agentId,
      getTodoManager: () => deps.todoManager,
      emitEvent,
    }),
    // TanStack batches TOOL_CALL_END until all tools finish; mirror each result into UI early.
    createEarlyToolResultUiMiddleware({
      getUIChannel: () => managed.ui,
    }),
    // Pre-start task subagents while args stream so parallel task calls run concurrently.
    createTaskPreforkMiddleware({
      getManagedAgent: () => managed,
      manager,
      emitEvent,
      getUIChannel: () => managed.ui,
    }),
    createPlanModeMiddleware({
      getPlanMode: () => managed.planMode,
    }),
    // Surface finished background jobs as a lightweight notification before each LLM call.
    // Both injects the notification into the current run's messages AND persists it as an
    // independent synthetic UIMessage so it survives across turns (prompt-cache friendly).
    createBackgroundNotificationMiddleware({
      getUIChannel: () => managed.ui,
      persistMessages: (next) => managed.maybeSaveSessionUIMessages(next, "user-message"),
    }),
    // After turn-context / tool filtering so breakpoints see the final wire payload.
    createPromptCacheMiddleware({
      getModelStyle: () => managed.config.modelStyle,
      getPromptCacheKey: () => resolvePromptCacheKey(deps.session.getSessionData()?.id, deps.agentId),
    }),
  ];

  const maxOutputTokens = managed.getConfig().maxTokens ?? deps.modelInfo?.defaultMaxTokens;

  return new AgentRunner({
    adapter: textAdapter.adapter,
    model: textAdapter.model,
    maxIterations: managed.config.maxIterations ?? DEFAULT_AGENT_MAX_ITERATIONS,
    systemPrompts: systemPrompt ? [systemPrompt] : undefined,
    tools: resolveTanStackTools(managed),
    middleware: instrumentMiddlewareLog(middleware, deps.log),
    temperature: managed.config.temperature,
    maxOutputTokens,
    reasoningEffort: managed.config.reasoningEffort ?? deps.modelInfo?.reasoningConfig?.defaultEffort,
    modelStyle: managed.config.modelStyle,
    lazyToolsConfig: managed.config.lazyToolsConfig,
  });
}

function runnerConfigKey(managed: ManagedAgent): string {
  return JSON.stringify({
    tools: Object.keys(managed.tools).sort(),
    model: managed.config.model,
    maxIterations: managed.config.maxIterations,
    temperature: managed.config.temperature,
    modelStyle: managed.config.modelStyle,
    modelBaseURL: managed.config.modelBaseURL,
    reasoningEffort: managed.config.reasoningEffort,
    // Rebuild when plan mode hides/restores tools
    planPhase: managed.planMode.getPhase(),
  });
}

export async function ensureAgentRunner(_manager: AgentManager, managed: ManagedAgent): Promise<AgentRunner> {
  const textAdapter = await resolveTextAdapterForManaged(managed);
  const configKey = runnerConfigKey(managed);

  const existing = managed.getRunner();
  if (existing && managed.getRunnerConfigKey() === configKey) {
    return existing;
  }

  managed.setRunnerConfigKey(configKey);
  const runner = buildAgentRunner(managed, textAdapter, _manager);
  managed.setRunner(runner);
  return runner;
}

// ============================================================================
// runAgentStream / runAgent
// ============================================================================

async function executeManagedAgentRun(
  manager: AgentManager,
  agentId: string,
  input: RunAgentStreamInput
): Promise<AsyncIterable<StreamChunk>> {
  const managed = manager.getAgent(agentId);
  if (!managed) throw new Error(`Agent not found: ${agentId}`);

  const runner = await ensureAgentRunner(manager, managed);

  let messages = input.messages;
  if (input.prompt && !messages) {
    messages = [{ role: "user", content: input.prompt }];
  }

  await managed.prepareForRun({
    messages: messages as Parameters<typeof managed.prepareForRun>[0]["messages"],
    prompt: input.prompt,
    abortSignal: input.abortSignal,
  });

  if (!managed.ui) {
    throw new Error(`Agent "${agentId}" requires a UI channel before LLM runs`);
  }

  // Use the RunCoordinator controller created in prepareForRun so ManagedAgent.abort()
  // cancels the same AbortController identity TanStack chat listens to.
  const abortController = managed.run.currentAbortController;
  if (!abortController) {
    throw new Error(`Agent "${agentId}" missing abort controller after prepareForRun`);
  }

  // Always read the live channel — compact / synthetic ctx injection may mutate it mid-run/recovery.
  return runStreamWithRecovery({
    managed,
    manager,
    getMessages: () => managed.ui?.getMessages() ?? [],
    run: (runMessages) =>
      runner.run({
        agentId,
        messages: runMessages,
        abortController,
        threadId: input.threadId,
        runId: input.runId,
      }),
    runner,
  });
}

export function runManagedAgentStream(
  manager: AgentManager,
  agentId: string,
  input: RunAgentStreamInput
): AsyncIterable<StreamChunk> {
  return (async function* () {
    const stream = await executeManagedAgentRun(manager, agentId, input);
    assertAsyncIterable(stream, `executeManagedAgentRun(${agentId})`);
    yield* stream;
  })();
}

/** Start a managed agent run and return the AG-UI chunk stream (no UI bridging). */
export async function runManagedAgent(
  manager: AgentManager,
  agentId: string,
  input: RunAgentStreamInput
): Promise<AsyncIterable<StreamChunk>> {
  return executeManagedAgentRun(manager, agentId, input);
}
