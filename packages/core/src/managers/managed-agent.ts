/* eslint-disable max-lines */
import {
  convertMessagesToModelMessages,
  type LazyToolsConfig,
  type ModelMessage,
  type UIMessage as TanStackUIMessage,
} from "@tanstack/ai";

import { AutoModeController } from "../agent/approval/auto-mode-controller.js";
import { buildAutoModePrompt } from "../agent/approval/auto-mode-prompt.js";
import { ToolApprovalTable } from "../agent/approval/tool-approval-table.js";
import { keepPolicyProjectionOptions, resolveKeepPolicy } from "../agent/compaction/keep-policy.js";
import { getModelVisibleMessages } from "../agent/compaction/message-chain-projection.js";
import { ToolCompactCache } from "../agent/compaction/tool-compact/tool-compact-cache.js";
import {
  createSessionSyncTracker,
  type SessionSaveReason,
  type SessionSyncTracker,
} from "../agent/persistence/session-sync-tracker.js";
import { PlanModeController } from "../agent/plan/plan-mode-controller.js";
import {
  buildModeInactivePrompt,
  buildPlanModePrompt,
  buildPlanRetroSteerMessage,
} from "../agent/plan/plan-prompts.js";
import { SummaryStreamHub } from "../agent/summary-stream/summary-stream-hub.js";
import { getCurrentDate, getGitInfo } from "../agent/turn-context/env-context.js";
import {
  formatInstructionContextSection,
  instructionStateChanged,
  loadLatestInstructionContent,
  readInstructionContextState,
  type InstructionContextState,
} from "../agent/turn-context/instruction-context.js";
import { type TurnContextSection } from "../agent/turn-context/turn-context-message.js";
import { Emitter } from "../utils/emitter.js";
import { generateId } from "../utils/generate-id.js";

import { AgentConfigSchema } from "./agent-types.js";
import { AgentChatController } from "./controllers/agent-chat-controller.js";
import { createAgentStatusController, type AgentStatusController } from "./controllers/agent-status-controller.js";
import { handleManagedReactiveCompact, runManualCompact } from "./managed-agent-compact.js";
import {
  beginPlanExecution as beginPlanExecutionHelper,
  cancelPlanExecution as cancelPlanExecutionHelper,
  completePlan as completePlanHelper,
  disablePlanMode as disablePlanModeHelper,
  enablePlanMode as enablePlanModeHelper,
  getPlanModeState as getPlanModeStateHelper,
  listWorkspacePlans as listWorkspacePlansHelper,
  loadPlanFromWorkspace as loadPlanFromWorkspaceHelper,
  savePlanToWorkspace as savePlanToWorkspaceHelper,
} from "./managed-agent-plan.js";
import { buildTurnContextSections, buildFrozenSystemPrompt } from "./managed-agent-prompt.js";
import {
  abortManagedAgentRun,
  finalizeManagedAgentRun,
  prepareManagedAgentForRun,
} from "./managed-agent-run-lifecycle.js";
import {
  persistSessionModelState,
  restoreManagedSession,
  saveSessionUIMessages as saveSessionUIMessagesHelper,
} from "./managed-agent-session.js";
import { RunCoordinator } from "./run-coordinator.js";
import { CompactionService } from "./services/compaction-service.js";
import { ExtensionRegistryService } from "./services/extension-registry-service.js";
import { MemoryService } from "./services/memory-service.js";
import { SessionService } from "./services/session-service.js";
import { UsageHistoryService } from "./services/usage-history-service.js";
import { emitAgentTelemetry } from "./telemetry/emit-agent-telemetry.js";
import { UsageTracker } from "./telemetry/usage-tracker.js";

import type { AgentManager } from "./agent-manager.js";
import type { AgentConfig, AgentStatus, RunFinalizeReason } from "./agent-types.js";
import type { AgentEvent, AgentEventType } from "./telemetry/agent-telemetry-bus.js";
import type { AgentLog } from "../agent/agent-log";
import type { CodeModeExtensionConfig } from "../agent/code-mode";
import type { CompactionConfig, CompactionConfigInput } from "../agent/compaction/types.js";
import type {
  ExtensionCommand,
  ExtensionFactory,
  ExtensionLoader,
  ExtensionRunner,
  ExtensionToolDefinition,
} from "../agent/extension";
import type { ExtensionTurnContextSection } from "../agent/extension/types.js";
import type { LspExtensionConfig } from "../agent/lsp";
import type { McpExtensionConfig } from "../agent/mcp";
import type { McpManager } from "../agent/mcp/manager.js";
import type { MemoryExtensionConfig } from "../agent/memory";
import type { MemoryManager } from "../agent/memory/memory-manager.js";
import type { SessionStore } from "../agent/persistence/session-store.js";
import type { SessionData } from "../agent/persistence/types.js";
import type { BeginPlanExecutionResult, PlanModeState } from "../agent/plan/plan-mode-controller.js";
import type { AgentRunner } from "../agent/runner/agent-runner.js";
import type { SkillRegistry, SkillsExtensionConfig } from "../agent/skills";
import type { TodoManager } from "../agent/todo";
import type { ToolsRecord } from "../agent/tools/runtime/tools-record.js";
import type { AgentToolConfig } from "../agent/tools/tool-config.js";
import type { AgentUIChannel } from "../agent/ui-channel.js";
import type { TextAdapterConfig } from "../models/adapter/adapter-factory.js";
import type { ModelStyle } from "../models/config/model-config.js";
import type { ModelInfo } from "../models/types.js";
import type { AgentEventPayloadMap } from "../runtime-types/agent-event-payloads.js";
import type { AgentRetryState } from "../runtime-types/agent-retry.js";

// ============================================================================
// Config
// ============================================================================

/** When the turn context payload hasn't changed, re-admit every N messages to keep context fresh. */
export type { RunFinalizeReason } from "./agent-types.js";

/** Active agent mode — mutually exclusive modes for the agent. */
export type AgentMode = "normal" | "auto" | "plan";

/** L1 runtime status surface projected to AgentSession `state` channel. */
export interface AgentL1State {
  status: AgentStatus;
  /** Agent display name (lets remote clients track renames via the state channel). */
  name: string;
  error: string;
  pendingApprovalCount: number;
  /** Present while a recoverable LLM failure is being retried (cleared once the stream recovers). */
  retry?: AgentRetryState | null;
}

export type ManagedAgentConfig<T = ManagedAgent> = AgentConfig & {
  id?: string;
  name: string;
  modelInfo?: ModelInfo;
  modelStyle?: ModelStyle;
  modelBaseURL?: string;
  modelApiKey?: string;
  setUp?: (instance: T) => T;
  /**
   * Additional skill directories to scan (before defaults). Relative paths resolve
   * against CoreEnv `rootPath`. When unset, defaults to `AGENT_SKILL_DIRS`,
   * `~/.agents/skills`, and `.agents/skills`. e.g. add `.cursor/skills` or
   * `.opencode/skills` to reuse skills written for other harnesses.
   */
  skillDirs?: string[];
  compaction?: CompactionConfigInput;
  mcpConfigPath?: string;
  agentDocFilenames?: string[];
  agentDocLoadOverride?: boolean;
  /**
   * Custom tools for subagents. When set, `spawnSubagent` will use these
   * instead of the default subagent tools. Pass `null` to clear all tools,
   * or omit to use the default read-only + web subagent tools.
   */
  subagentTools?: ToolsRecord | null;
  /**
   * Programmatic extension factories to load on bootstrap.
   * Each factory is called during agent initialization.
   */
  extensions?: Array<ExtensionFactory>;
  /**
   * Enable the built-in LSP extension (default: true). Set to `false` to disable
   * LSP tools (lsp_diagnostics, lsp_hover, ...) and slash commands. Pass an
   * object to fine-tune which tools are registered (see {@link LspExtensionConfig}).
   */
  lsp?: boolean | LspExtensionConfig;
  /**
   * Enable the built-in Skills extension (default: true). Set to `false` to disable
   * skill tools (list_skills, load_skill) and the available-skills index in turn
   * context. Pass an object to fine-tune behavior (see {@link SkillsExtensionConfig}).
   */
  skills?: boolean | SkillsExtensionConfig;
  /**
   * Enable the built-in Memory extension (default: true). Set to `false` to disable
   * memory tools (memory_list, memory_read, memory_write) and the memory index in
   * turn context. Pass an object to fine-tune behavior (see {@link MemoryExtensionConfig}).
   */
  memory?: boolean | MemoryExtensionConfig;
  /**
   * Enable the built-in MCP extension (default: true). Set to `false` to disable
   * MCP servers and their `mcp__<server>_<tool>` tools. Pass an object to fine-tune
   * behavior (see {@link McpExtensionConfig}).
   */
  mcp?: boolean | McpExtensionConfig;
  /**
   * Enable the built-in Code Mode extension (default: true). Set to `false` to
   * disable sandboxed TypeScript execution (`execute_typescript`). Pass an object
   * to fine-tune the exposed `external_*` tool subset and lazy behavior (see
   * {@link CodeModeExtensionConfig}). The extension degrades gracefully when the
   * host does not provide a `createIsolateDriver` capability.
   */
  codeMode?: boolean | CodeModeExtensionConfig;
  /**
   * Tune lazy-tool discovery for top-level tools marked `lazy: true` (how much of
   * each lazy tool's description appears in the pre-discovery catalog). Defaults
   * to `{ includeDescription: 'none' }`. Only relevant when some tool is lazy.
   */
  lazyToolsConfig?: LazyToolsConfig;
  /**
   * Extra filesystem directories to scan for extensions (before env / defaults).
   * Relative paths resolve against CoreEnv `rootPath`.
   */
  extensionDirs?: string[];
  /** Explicit tool secrets / prefs (hosts pass; tools must not dig CoreEnv env bags). */
  toolConfig?: AgentToolConfig;
};

/** Subagent preview / non-useChat UI channel (TanStack StreamProcessor). */
export type AgentUIChannelRef = Pick<
  AgentUIChannel,
  "getMessages" | "subscribe" | "subscribeCustomEvents" | "subscribeApprovalRequests"
>;

// ============================================================================
// ManagedAgent — composition root
// ============================================================================

/**
 * Central runtime object. Owns composed services and orchestrates cross-service calls.
 * Individual services ({@link MemoryService}, {@link SessionService}, {@link RunCoordinator})
 * hold only their own state; they never reference each other.
 */
export class ManagedAgent {
  // ============================================================================
  // Identity
  // ============================================================================

  readonly id: string;
  name: string;
  /**
   * Single source of truth for agent configuration (AgentConfig fields + agent
   * extras like name/id/modelInfo/skillDirs). Validated through
   * {@link AgentConfigSchema} at construction; mutated in place by
   * {@link updateConfig} so all runtime readers (`run-agent`, snapshots) see
   * updates immediately.
   */
  readonly config: ManagedAgentConfig;

  // ============================================================================
  // L1 state + local emitter
  // ============================================================================

  /** Lifecycle — hosts read via getter; mutate through {@link setStatus}. */
  private currentStatus: AgentStatus;
  private error: string;
  /** Tools awaiting user approval in the current run (set by approval middleware). */
  private pendingApprovalCount: number;
  /** Live LLM retry visibility (set by stream recovery; cleared when the stream recovers). */
  private retryInfo: AgentRetryState | null = null;
  private readonly stateEvents: Emitter<{
    change: AgentL1State;
    /** Fired when {@link setUIChannel} attaches/clears the UI channel. */
    ui: AgentUIChannel | undefined;
  }>;

  // ============================================================================
  // Composed services / controllers
  // ============================================================================

  /** Composed services — each owns only its domain state */
  readonly usage: UsageTracker;
  readonly memory: MemoryService;
  readonly session: SessionService;
  /** Global (cross-session) LLM usage persistence — contribution-graph source. */
  readonly usageHistory: UsageHistoryService;
  readonly run: RunCoordinator;
  readonly statusController: AgentStatusController;
  /** Plan mode (read-only planning → execute). Root agents only; subagents leave phase off. */
  readonly planMode: PlanModeController;
  /** Auto / YOLO mode — skip all tool approvals. Cleared on reset / `/clear`. */
  readonly autoMode: AutoModeController;
  /** Session-backed tool-approval interrupt table. */
  readonly approvals: ToolApprovalTable;

  // ============================================================================
  // Tools / registries / extensions
  // ============================================================================

  tools: ToolsRecord;
  log: AgentLog;
  /** Extension / tool / integration registration domain (todo, MCP, skills, extensions). */
  readonly extensions: ExtensionRegistryService;

  // Set-once managers + extension runtime — owned by {@link extensions}, exposed
  // as getters so external readers keep the field-like syntax.
  get todoManager(): TodoManager | null {
    return this.extensions.getTodoManager();
  }

  get mcpManager(): McpManager | null {
    return this.extensions.getMcpManager();
  }

  get skillRegister(): SkillRegistry | null {
    return this.extensions.getSkillRegistry();
  }

  get extensionRunner(): ExtensionRunner | null {
    return this.extensions.getExtensionRunner();
  }

  get extensionLoader(): ExtensionLoader | null {
    return this.extensions.getExtensionLoader();
  }

  // ============================================================================
  // Agent tree + timestamps
  // ============================================================================

  parentId?: string;
  parentTaskId?: string;
  childIds: string[];
  createdAt: number;
  updatedAt: number;

  // ============================================================================
  // Run / UI / model wiring
  // ============================================================================

  /** Package-internal TanStack runner wiring — not part of the host-facing surface. */
  private runner?: AgentRunner;
  private runnerConfigKey?: string;
  private textAdapter?: TextAdapterConfig;
  resolveTextAdapter?: () => Promise<TextAdapterConfig | null>;
  private uiChannel?: AgentUIChannel;
  private approvalRequestUnsub?: () => void;
  /** Task / compact summary streams for the session `summary` channel. */
  readonly summaryStreams: SummaryStreamHub;
  private chatController?: AgentChatController;
  /** Set by AgentManager to route events to listeners. */
  dispatchEvent?: (event: AgentEvent) => void;
  /** Owning manager — set when registered via {@link AgentManager.createManagedAgent}. */
  manager?: AgentManager;
  modelInfo: ModelInfo | null;

  // ============================================================================
  // Compaction / session sync
  // ============================================================================

  readonly compaction: CompactionService;
  readonly toolCompactCache: ToolCompactCache;
  readonly sessionSyncTracker: SessionSyncTracker;

  // ============================================================================
  // Run lifecycle flags + timing
  // ============================================================================

  // Run lifecycle flags/timing moved to RunCoordinator (this.run) — methods below delegate.

  // ============================================================================
  // Prompt / turn context
  // ============================================================================

  private systemPrompt: string;
  agentDocContent: string;
  agentDocSource: string;
  private frozenSystemPrompt: string | undefined;
  private systemPromptFrozen: boolean;
  /** Pending per-extension turn-context sections collected in prepareForRun (before injection). */
  private pendingExtensionTurnContextSections: ExtensionTurnContextSection[] | undefined;
  /** Latest admitted hash per section kind (restore-seeded; only changed kinds re-admit). */
  private lastAdmittedTurnContextHashes: Map<string, string> | undefined;
  /** Message count at the last context admit (for periodic refresh; state owned by turn-context middleware). */
  private turnContextAdmitMessageCount: number;
  /** Last-seen instruction file digest snapshot (for instruction change detection). */
  private instructionContextState: InstructionContextState | undefined;
  /** Once an instruction change is detected, keep re-injecting (stable payload). */
  private instructionContextActive = false;

  constructor(
    config: ManagedAgentConfig,
    init: {
      id?: string;
      log: AgentLog;
      tools: ToolsRecord;
      todoManager: TodoManager | null;
      parentId?: string;
      usage?: UsageTracker;
      memory?: MemoryService;
      session?: SessionService;
      usageHistory?: UsageHistoryService;
      extensions?: ExtensionRegistryService;
      compaction?: CompactionService;
    }
  ) {
    this.id = init.id ?? config.id ?? generateId("agent");
    this.name = config.name;
    // Single source of truth: shallow-copy the agent extras, then overlay the
    // zod-parsed AgentConfig subset (validation + defaults, e.g. maxIterations).
    this.config = { ...config, ...AgentConfigSchema.parse(config) };
    this.log = init.log;
    this.tools = init.tools;
    this.extensions = init.extensions ?? new ExtensionRegistryService();
    if (init.todoManager) this.extensions.setTodoManager(init.todoManager);
    this.parentId = init.parentId;
    this.usage = init.usage ?? new UsageTracker();
    this.memory = init.memory ?? new MemoryService();
    this.session = init.session ?? new SessionService();
    this.usageHistory = init.usageHistory ?? new UsageHistoryService();
    this.run = new RunCoordinator();
    this.childIds = [];
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.extensions.setManagedToolsProvider(() => this.tools);
    this.statusController = createAgentStatusController({
      getStatus: () => this.status,
      setStatus: (status, trigger) => this.setStatus(status, trigger),
      getError: () => this.error,
      setError: (error) => this.setError(error),
      setPendingApprovalCount: (count) => this.setPendingApprovalCount(count),
      emitEvent: (type, data) => this.emitEvent(type, data),
    });

    this.planMode = new PlanModeController({
      emitEvent: (type, data) => this.emitEvent(type, data),
      getTodoManager: () => this.todoManager,
      onPhaseChange: () => {
        this.invalidateRunner();
        this.emitStateChange();
      },
      onEnterRetro: (state) => {
        const steer = buildPlanRetroSteerMessage(state.planFilePath);
        if (this.chatController) {
          // followUp, not sendMessage: retro entry fires mid-run (last todo
          // completed via the todo tool), and the running pump's tool snapshot
          // was resolved in `executing` where complete_plan is excluded. A
          // steer would deliver inside the same run → "Unknown tool".
          // followUp starts a fresh run whose toolset includes complete_plan.
          this.chatController.followUp(steer);
        }
      },
    });
    this.autoMode = new AutoModeController(() => this.emitStateChange());
    this.approvals = new ToolApprovalTable({
      onResolved: (resolution) => {
        this.emitEvent("agent:tool-approval-resolved", {
          tool_call_id: resolution.toolCallId,
          approval_id: resolution.approvalId,
          tool_name: resolution.toolName,
          decision: resolution.decision,
          ...(resolution.reason ? { reason: resolution.reason } : {}),
        });
      },
    });

    // ============================================================================
    // L1 state + local emitter (inline inits)
    // ============================================================================
    this.currentStatus = "idle";
    this.error = "";
    this.pendingApprovalCount = 0;
    this.stateEvents = new Emitter<{
      change: AgentL1State;
      ui: AgentUIChannel | undefined;
    }>();

    // ====================================================================================
    // (Tools / registries / extensions init moved into ExtensionRegistryService)
    // ====================================================================================

    // ============================================================================
    // Run / UI / model wiring (inline inits)
    // ============================================================================
    this.summaryStreams = new SummaryStreamHub();
    this.modelInfo = null;

    // ============================================================================
    // Compaction / session sync (inline inits)
    // ============================================================================
    this.compaction = init.compaction ?? new CompactionService();
    this.toolCompactCache = new ToolCompactCache();
    this.sessionSyncTracker = createSessionSyncTracker();

    // ============================================================================
    // (Run lifecycle flags + timing inits moved into RunCoordinator)
    // ============================================================================

    // ============================================================================
    // Prompt / turn context (inline inits)
    // ============================================================================
    this.systemPrompt = "";
    this.agentDocContent = "";
    this.agentDocSource = "";
    this.systemPromptFrozen = false;
    this.lastAdmittedTurnContextHashes = undefined;
    this.turnContextAdmitMessageCount = 0;
    this.instructionContextState = undefined;
    this.instructionContextActive = false;

    if (config.setUp) {
      return config.setUp(this);
    }

    return this;
  }

  // ============================================================================
  // Status & events
  // ============================================================================

  /** Host-facing status (read-only; use {@link setStatus} to mutate). */
  get status(): AgentStatus {
    return this.currentStatus;
  }

  /** Host-facing UI channel when present (read-only; package-internal {@link setUIChannel}). */
  get ui(): AgentUIChannel | undefined {
    return this.uiChannel;
  }

  getError(): string {
    return this.error;
  }

  getPendingApprovalCount(): number {
    return this.pendingApprovalCount;
  }

  getStreamStartedAt(): number {
    return this.run.getStreamStartedAt();
  }

  setStreamStartedAt(value: number): void {
    this.run.setStreamStartedAt(value);
  }

  getLastStreamDurationMs(): number {
    return this.run.getLastStreamDurationMs();
  }

  setStatus(status: AgentStatus, trigger?: string): void {
    const prev = this.currentStatus;
    if (status === "completed" || status === "aborted" || status === "error") {
      this.recordStreamDuration();
      // Terminal — any in-flight retry visibility is over.
      this.retryInfo = null;
    }
    this.currentStatus = status;
    // Timeline: log actual transitions only (no-op sets stay silent).
    if (prev !== status) {
      this.log?.info("agent", `Status: ${prev} → ${status}`, {
        from: prev,
        to: status,
        ...(trigger ? { trigger } : {}),
      });
    }
    this.emitStateChange();
  }

  /** Track the active run id for log run-scoping (see RunLifecycleHost). */
  setCurrentRunId(runId: string | null): void {
    this.run.setCurrentRunId(runId);
  }

  getCurrentRunId(): string | null {
    return this.run.getCurrentRunId();
  }

  /** Snapshot wall-clock duration for the current turn into lastStreamDurationMs. */
  recordStreamDuration(): void {
    this.run.recordStreamDuration();
  }

  setError(error: string): void {
    this.error = error;
    this.emitStateChange();
  }

  setPendingApprovalCount(count: number): void {
    this.pendingApprovalCount = count;
    this.emitStateChange();
  }

  getRetry(): AgentRetryState | null {
    return this.retryInfo;
  }

  /** @internal Used by stream recovery to surface retry progress to hosts. */
  setRetry(retry: AgentRetryState | null): void {
    this.retryInfo = retry;
    this.emitStateChange();
  }

  /**
   * App host API — pause agent status while a client tool (e.g. `ask_user`) waits for user input.
   * Core does not infer this from messages; the UI sets it when opening/closing client-tool flows.
   */
  setClientToolWaiting(active: boolean): void {
    this.statusController.setClientToolWaiting(active);
  }

  /** Sync approval / client-tool pause status from loaded UIMessages (e.g. session resume). */
  syncInteractionStateFromUIMessages(
    messages: TanStackUIMessage[],
    options?: { whenClear?: "idle" | "running" | "completed" }
  ): void {
    if (options?.whenClear === "running") {
      this.statusController.reconcileWithPolicy(messages, "during-run");
      return;
    }
    if (options?.whenClear === "completed") {
      this.statusController.reconcileWithPolicy(messages, "after-chat-run");
      return;
    }
    this.statusController.reconcileWithPolicy(messages, "idle-clear");
  }

  /** Reconcile status after a chat pump finishes. */
  syncRunStatusFromUIMessages(messages: TanStackUIMessage[]): void {
    this.statusController.applyRunOutcome({ kind: "finished", messages, path: "chat" });
  }

  /** L1 status snapshot for Emitter / Session projection. */
  /** Rename the display name and notify state-channel subscribers (session rename command). */
  setDisplayName(name: string): void {
    this.name = name;
    this.emitStateChange();
  }

  getL1State(): AgentL1State {
    return {
      status: this.currentStatus,
      name: this.name,
      error: this.error,
      pendingApprovalCount: this.pendingApprovalCount,
      ...(this.retryInfo ? { retry: this.retryInfo } : {}),
    };
  }

  /**
   * Typed domain events for this agent:
   * - `change` — L1 status/error/pendingApproval (fires current snapshot on subscribe)
   * - `ui` — UI channel attach/clear
   *
   * Hosts should prefer AgentSession channels.
   */
  on<K extends "change" | "ui">(
    type: K,
    listener: (payload: K extends "change" ? AgentL1State : AgentUIChannel | undefined) => void
  ): () => void {
    const unsub = this.stateEvents.on(type, listener as (payload: AgentL1State | AgentUIChannel | undefined) => void);
    if (type === "change") {
      (listener as (payload: AgentL1State) => void)(this.getL1State());
    }
    return unsub;
  }

  private emitStateChange(): void {
    this.stateEvents.emit("change", this.getL1State());
  }

  emitEvent<T extends AgentEventType>(
    type: T,
    payload?: AgentEventPayloadMap[T],
    options?: { parentId?: string; agentId?: string }
  ): void {
    emitAgentTelemetry(this, type, payload, options);
  }

  getSessionData(): SessionData | null {
    return this.session.getSessionData();
  }

  /**
   * Ensure in-memory session data exists (allocates a stable `ses_` id without
   * writing to disk). See {@link SessionService.ensureSessionData}.
   */
  ensureSessionData(): SessionData | null {
    return this.session.ensureSessionData();
  }

  // ============================================================================
  // Config & resources
  // ============================================================================

  getConfig(): Readonly<AgentConfig> {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    // Mutate the single config object in place (AgentConfigSchema strips the
    // agent extras, so only the AgentConfig subset is overlaid).
    Object.assign(this.config, AgentConfigSchema.parse({ ...this.config, ...updates }));
  }

  /** Current reasoning-effort level, or undefined when unset (model default). */
  getReasoningEffort(): AgentConfig["reasoningEffort"] {
    return this.config.reasoningEffort;
  }

  /**
   * Set the reasoning-effort level and invalidate the cached runner so the next
   * run rebuilds {@link AgentRunner} with the new `modelOptions`.
   */
  setReasoningEffort(effort: AgentConfig["reasoningEffort"]): void {
    this.updateConfig({ reasoningEffort: effort });
    this.invalidateRunner();
    this.persistSession();
    this.emitStateChange();
  }

  setModelInfo(info: ModelInfo): void {
    this.log?.debug("agent", "Setting model info", {
      id: info.id,
      style: info.style,
      contextWindow: info.contextWindow,
    });
    this.modelInfo = info;
  }

  getModelInfo(): ModelInfo | null {
    return this.modelInfo;
  }

  /**
   * Switch the agent's model at runtime without rebuilding the session.
   *
   * Updates the frozen model config, drops the cached text adapter so the next
   * run resolves the new model, and persists — the conversation history and
   * live session are preserved. Only the provided fields are changed; omitted
   * ones keep their current value.
   *
   * NOTE: local provider mode only. Under remote-provider the server re-supplies
   * the model on the next (re)create, so callers should gate this on
   * `providerMode !== "remote"` (see resolve-from-provider.ts).
   */
  setModel(next: {
    model?: string;
    modelStyle?: ModelStyle;
    modelBaseURL?: string;
    modelApiKey?: string;
    modelInfo?: ModelInfo | null;
  }): void {
    const updates: Partial<AgentConfig> = {};
    if (next.model !== undefined) updates.model = next.model;
    if (next.modelStyle !== undefined) updates.modelStyle = next.modelStyle;
    if (next.modelBaseURL !== undefined) updates.modelBaseURL = next.modelBaseURL;
    if (next.modelApiKey !== undefined) updates.modelApiKey = next.modelApiKey;
    if (Object.keys(updates).length > 0) {
      this.updateConfig(updates);
    }

    if (next.modelInfo) {
      this.setModelInfo(next.modelInfo);
      if (next.modelInfo.pricing) {
        this.usage.setPricing(next.modelInfo.pricing);
      }
      this.usage.setCapabilities(next.modelInfo.capabilities);
    }

    // Keep new on-disk sessions (`/clear`, session.new) on the switched model.
    if (updates.model !== undefined || updates.modelStyle !== undefined) {
      this.session.setModelConfig(updates.modelStyle ?? "openai", updates.model ?? "unknown");
    }

    // Drop the cached adapter + runner so the next run re-resolves the model.
    this.setTextAdapter(undefined);
    this.invalidateRunner();
    this.persistSession();
    this.emitStateChange();
  }

  /** Canonical model messages from the UI channel only. */
  getCanonicalFromUI(): ModelMessage[] {
    const uiMessages = this.ui?.getMessages() ?? [];
    if (uiMessages.length === 0) return [];
    return convertMessagesToModelMessages(uiMessages);
  }

  /**
   * Messages sent to the LLM after in-chain compaction summary projection.
   */
  getMessagesForLLM(canon?: ModelMessage[]): ModelMessage[] {
    const base = canon ?? this.getCanonicalFromUI();
    const policy = keepPolicyProjectionOptions(
      resolveKeepPolicy(this.compaction.getConfig() ?? {}, this.modelInfo?.contextWindow)
    );
    return getModelVisibleMessages(base, policy);
  }

  setLog(c: AgentLog): void {
    this.log = c;
  }

  getLog(): AgentLog {
    return this.log;
  }

  setTodoManager(t: TodoManager): void {
    this.extensions.setTodoManager(t);
  }

  getTodoManager(): TodoManager | null {
    return this.extensions.getTodoManager();
  }

  setMemoryManager(manager: MemoryManager): void {
    this.memory.setManager(manager);
  }

  getMemoryManager(): MemoryManager | null {
    return this.memory.getManager();
  }

  setSessionStore(store: SessionStore, sessionConfig: { modelStyle: string; model: string }): void {
    this.session.setStore(store, sessionConfig);
  }

  getSessionStore(): SessionStore | null {
    return this.session.getStore();
  }

  setSessionData(data: SessionData): void {
    this.session.setSessionData(data);
  }

  /**
   * Persist `uiMessages` when an explicit trigger fires and the fingerprint changed.
   * Reasons: `user-message` | `pump-complete` | `force` (via {@link saveSessionUIMessages}).
   * Fire-and-forget — dehydrate + disk write happen in the background.
   */
  maybeSaveSessionUIMessages(uiMessages: TanStackUIMessage[], reason: SessionSaveReason): void {
    if (uiMessages.length === 0) return;
    if (!this.sessionSyncTracker.shouldPersist(uiMessages, { reason })) {
      return;
    }
    void saveSessionUIMessagesHelper(this, uiMessages);
  }

  /**
   * Force-persist session `uiMessages` (slash commands such as `/clear`).
   * Fire-and-forget — dehydrate + disk write happen in the background.
   */
  saveSessionUIMessages(uiMessages: TanStackUIMessage[]): void {
    void saveSessionUIMessagesHelper(this, uiMessages);
  }

  /** Reset fingerprint tracking after restore, clear, or new chat bootstrap. */
  resetSessionSyncTracker(uiMessages?: TanStackUIMessage[]): void {
    this.sessionSyncTracker.reset(uiMessages);
  }

  /** Persist model state only (usage, todos). Does not write `uiMessages`. */
  persistSession(): void {
    void persistSessionModelState(this);
  }

  /**
   * Finalize a user turn / detached run — persist session, clear turn memory, optionally extract memories, emit `agent:stop`.
   * Owned by {@link AgentChatController} / subagent runners (not per-`chat()` middleware).
   * Memory extraction runs only when `reason === "finished"`. Idempotent per turn until {@link resetTurnLifecycle}.
   */
  finalizeRun(manager: AgentManager, reason: RunFinalizeReason): void {
    finalizeManagedAgentRun(this, manager, reason);
  }

  /** Call at the start of a chat pump or detached run so finalize can run once for that turn. */
  resetTurnLifecycle(): void {
    this.run.resetTurnLifecycle();
  }

  /**
   * Claim turn finalization. @returns false when already finalized for this turn.
   * @internal Used by {@link finalizeManagedAgentRun}.
   */
  beginTurnFinalize(): boolean {
    return this.run.beginTurnFinalize();
  }

  setAgentDocContent(content: string, source?: string): void {
    this.agentDocContent = content;
    this.agentDocSource = source ?? "";
  }

  getAgentDocContent(): string {
    return this.agentDocContent;
  }

  setSkillRegistry(t: SkillRegistry): void {
    this.extensions.setSkillRegistry(t);
  }

  getSkillRegistry(): SkillRegistry | null {
    return this.extensions.getSkillRegistry();
  }

  setMcpManager(m: McpManager): void {
    this.extensions.setMcpManager(m);
  }

  getMcpManager(): McpManager | null {
    return this.extensions.getMcpManager();
  }

  registerTool(def: ExtensionToolDefinition): void {
    this.extensions.registerTool(def, {
      tools: this.tools,
      warn: (message) => this.log?.warn("system", message),
      onToolsChanged: () => this.setRunnerConfigKey(undefined),
    });
  }

  registerCommand(cmd: ExtensionCommand): void {
    this.extensions.registerCommand(cmd, (message) => this.log?.warn("system", message));
  }

  /** Unregister a tool previously added by an extension (used when disabling). */
  unregisterExtensionTool(name: string): void {
    this.extensions.unregisterExtensionTool(name, {
      tools: this.tools,
      warn: (message) => this.log?.warn("system", message),
      onToolsChanged: () => this.setRunnerConfigKey(undefined),
    });
  }

  /** Unregister a command previously added by an extension (used when disabling). */
  unregisterExtensionCommand(name: string): void {
    this.extensions.unregisterExtensionCommand(name);
  }

  getExtensionCommands(): ExtensionCommand[] {
    return this.extensions.getExtensionCommands();
  }

  setCompactionConfig(config: CompactionConfig): void {
    this.log?.debug("agent", "Setting compaction config", {
      tokenThreshold: config.tokenThreshold,
    });
    this.compaction.setConfig(config);
    this.usage.setTokenLimit(config.tokenThreshold);
  }

  getCompactionConfig(): CompactionConfig | null {
    return this.compaction.getConfig();
  }

  getToolCompactCache(): ToolCompactCache {
    return this.toolCompactCache;
  }

  getSystemPrompt(): string | undefined {
    if (this.systemPromptFrozen) return this.frozenSystemPrompt;
    this.frozenSystemPrompt = buildFrozenSystemPrompt({
      config: this.config,
      agentDocContent: this.agentDocContent,
    });
    this.systemPromptFrozen = true;
    this.systemPrompt = this.frozenSystemPrompt ?? "";
    return this.frozenSystemPrompt;
  }

  /** Alias for the cacheable system prompt prefix (before per-turn dynamic segment). */
  getFrozenSystemPrompt(): string | undefined {
    return this.getSystemPrompt();
  }

  // --- Turn-context admission state (owned here, mutated by turn-context middleware). ---

  getAdmittedContextHashes(): Map<string, string> | undefined {
    return this.lastAdmittedTurnContextHashes;
  }

  setAdmittedContextHashes(hashes: Map<string, string> | undefined): void {
    this.lastAdmittedTurnContextHashes = hashes;
  }

  getTurnContextAdmitMessageCount(): number {
    return this.turnContextAdmitMessageCount;
  }

  setTurnContextAdmitMessageCount(count: number): void {
    this.turnContextAdmitMessageCount = count;
  }

  /**
   * Collect `before_agent_start` interceptors + turn-context providers for this user turn.
   * Runs in prepareForRun; the turn-context middleware consumes the results at onConfig.
   */
  async collectExtensionPromptHooks(prompt: string): Promise<void> {
    this.pendingExtensionTurnContextSections = undefined;

    const runner = this.extensionRunner;
    if (!runner) return;

    const collected = await runner.collectBeforeAgentStart(prompt, this.id);
    this.pendingExtensionTurnContextSections = collected.turnContextSections;

    this.emitEvent("prompt:before", {
      prompt,
      hasTurnContext: Boolean(collected.turnContextSections?.length),
    });
  }

  /** After compaction / clear — force the next turn to re-admit full dynamic context. */
  resetAdmittedTurnContext(): void {
    this.lastAdmittedTurnContextHashes = undefined;
    this.turnContextAdmitMessageCount = 0;
    this.instructionContextState = undefined;
    this.instructionContextActive = false;
  }

  clearTurnContext(): void {
    this.memory.clearTurnContext();
    this.pendingExtensionTurnContextSections = undefined;
    // NOTE: instructionContextState / instructionContextActive intentionally NOT
    // reset here — like lastAdmittedTurnContextHashes they must survive across user
    // turns (clearTurnContext runs at every turn finalize). Otherwise every turn
    // re-baselines and cross-turn instruction changes are never detected. Reset
    // only on compact / full context reset (resetAdmittedTurnContext).
  }

  resetSystemPrompt(): void {
    this.systemPromptFrozen = false;
    this.frozenSystemPrompt = undefined;
    this.invalidateRunner();
  }

  /** Build the ordered dynamic turn-context sections for the current user turn. */
  async getDynamicTurnContextSections(): Promise<TurnContextSection[]> {
    let todoNagReminder: string | undefined;
    if (this.todoManager?.shouldNag()) {
      todoNagReminder = this.todoManager.getNagReminder(this.todoManager.getRoundsSinceUpdate());
      this.log?.debug("todo", "Capturing nag reminder in turn context snapshot", {
        roundsSinceUpdate: this.todoManager.getRoundsSinceUpdate(),
      });
    }

    const currentDate = getCurrentDate();
    const { branch: gitBranch, status: gitStatus } = await getGitInfo();

    const planState = this.planMode.getState();
    const planModeContent = buildPlanModePrompt(planState.phase, planState.planMarkdown, planState.planFilePath);
    // Plan turn-context wins when plan is active; auto prompt only in pure auto mode.
    // The mode section is always present (inactive declaration when neither is
    // active) so mode exits are explicitly communicated and re-entries with
    // identical instructions still re-inject (content reflects state).
    const autoModeContent = !planModeContent && this.autoMode.isEnabled() ? buildAutoModePrompt() : undefined;
    const modeContent = planModeContent ?? autoModeContent ?? buildModeInactivePrompt();

    // Instruction files are frozen into the system prompt at startup; if the model
    // edited AGENTS.md / CLAUDE.md since we last evaluated, re-inject the latest
    // content. Only injected on change — unchanged keeps the payload byte-stable
    // (prompt-cache friendly). First evaluation establishes the baseline (frozen
    // system prompt already carries the initial content).
    const instructionContext = await this.readChangedInstructionContext();

    const sections = buildTurnContextSections({
      relevantMemoryContent: this.memory.getRelevantContent(),
      todoNagReminder,
      currentDate,
      gitBranch,
      gitStatus,
      modeContent,
      extensionTurnContextSections: this.pendingExtensionTurnContextSections,
      instructionContext,
    });
    return sections;
  }

  /**
   * Detect whether instruction files changed since the last evaluation and, when
   * so, return the rendered `<instruction_context>` section with the latest content.
   * Always refreshes the stored digest snapshot (baseline = first evaluation).
   */
  private async readChangedInstructionContext(): Promise<string | undefined> {
    try {
      const current = await readInstructionContextState();
      // Baseline: the first evaluation only stores the snapshot without injecting —
      // the frozen system prompt already carries the initial instructions. This also
      // covers the restore-from-session case (fresh instance, no prior snapshot).
      if (this.instructionContextState === undefined) {
        this.instructionContextState = current;
        return undefined;
      }

      const changed = instructionStateChanged(this.instructionContextState, current);
      this.instructionContextState = current;
      if (!this.instructionContextActive && !changed) return undefined;

      // Sticky: once a change is detected we keep re-injecting the latest content so
      // the payload stays stable across turns (prompt-cache friendly). A fresh
      // change re-reads the newest file content into the section.
      this.instructionContextActive = true;
      const loaded = await loadLatestInstructionContent();
      return formatInstructionContextSection(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log?.warn("agent", "Instruction-context detection failed", { error: message });
      return undefined;
    }
  }

  // ============================================================================
  // Auto-approve mode (skip all tool approvals)
  // ============================================================================

  isAutoModeEnabled(): boolean {
    return this.autoMode.isEnabled();
  }

  setAutoModeEnabled(enabled: boolean): void {
    this.autoMode.setEnabled(enabled);
    // Auto mode and plan mode are mutually exclusive — enabling auto disables plan
    if (enabled && this.planMode.getPhase() !== "off") {
      this.planMode.disable();
    }
  }

  /**
   * Whether pending tool approvals should be auto-approved this turn.
   * True when auto mode is on, or plan mode is building a seeded plan.
   */
  shouldAutoApprovePendingTools(): boolean {
    return this.autoMode.isEnabled() || this.planMode.shouldAutoApproveTools();
  }

  /**
   * Return the current agent mode.
   * Plan mode takes priority over auto mode; normal is the fallback.
   */
  getAgentMode(): AgentMode {
    if (this.planMode.getPhase() !== "off") return "plan";
    if (this.autoMode.isEnabled()) return "auto";
    return "normal";
  }

  /**
   * Set the agent to an explicit mode. Modes are mutually exclusive:
   * setting auto exits plan; setting plan exits auto; normal clears both.
   * @returns the resulting mode
   */
  setAgentMode(mode: AgentMode): AgentMode {
    if (mode === "plan") {
      this.enablePlanMode();
    } else if (mode === "auto") {
      this.setAutoModeEnabled(true);
    } else {
      if (this.planMode.getPhase() !== "off") this.disablePlanMode();
      this.autoMode.setEnabled(false);
    }
    return this.getAgentMode();
  }

  /** Cycle normal → auto → plan → normal. @returns the resulting mode */
  cycleAgentMode(): AgentMode {
    const current = this.getAgentMode();
    return this.setAgentMode(current === "normal" ? "auto" : current === "auto" ? "plan" : "normal");
  }

  // ============================================================================
  // Plan mode
  // ============================================================================

  enablePlanMode(): void {
    enablePlanModeHelper(this);
    // Plan mode and auto mode are mutually exclusive — enabling plan disables auto
    if (this.autoMode.isEnabled()) {
      this.autoMode.setEnabled(false);
    }
  }

  disablePlanMode(): void {
    disablePlanModeHelper(this);
  }

  getPlanModeState(): PlanModeState {
    return getPlanModeStateHelper(this);
  }

  beginPlanExecution(options: { sendSteer?: boolean } = {}): BeginPlanExecutionResult {
    return beginPlanExecutionHelper(this, options);
  }

  cancelPlanExecution(): boolean {
    return cancelPlanExecutionHelper(this);
  }

  async savePlanToWorkspace(nameHint?: string): Promise<{ ok: boolean; path?: string; error?: string }> {
    return savePlanToWorkspaceHelper(this, nameHint);
  }

  async loadPlanFromWorkspace(
    name: string
  ): Promise<{ ok: boolean; path?: string; error?: string; stepCount?: number }> {
    return loadPlanFromWorkspaceHelper(this, name);
  }

  completePlan(): { ok: boolean; error?: string } {
    return completePlanHelper(this);
  }

  async listWorkspacePlans(): Promise<string[]> {
    return listWorkspacePlansHelper();
  }

  // ============================================================================
  // Run orchestration (ManagedAgent coordinates services)
  // ============================================================================

  /** Mark the next prepareForRun as a mid-turn continuation (queued steer / tool phase). */
  markNextPrepareAsContinuation(): void {
    this.run.markNextPrepareAsContinuation();
  }

  /** Clear a leftover continuation mark (e.g. on turn finalize). */
  clearPrepareAsContinuation(): void {
    this.run.clearPrepareAsContinuation();
  }

  /** Consume and clear the continuation flag for prepareForRun. */
  consumePrepareAsContinuation(): boolean {
    return this.run.consumePrepareAsContinuation();
  }

  async prepareForRun(options: {
    prompt?: string;
    messages?: Array<TanStackUIMessage | ModelMessage>;
    abortSignal?: AbortSignal;
  }) {
    await prepareManagedAgentForRun(this, options);
  }

  shouldTriggerAutoCompact(messages?: ModelMessage[]): boolean {
    return this.compaction.shouldTriggerAutoCompact({
      windowInputTokens: this.usage.getWindowUsage().inputTokens,
      messages,
      contextWindow: this.modelInfo?.contextWindow,
    });
  }

  getCacheHitRatio(): number {
    const total = this.usage.getTotal();
    if (total.inputTokens <= 0) return 0;
    return (total.cacheReadTokens ?? 0) / total.inputTokens;
  }

  /**
   * Register a tool-scoped AbortController so {@link abort} cancels in-flight
   * HTTP work (e.g. webfetch / websearch) alongside the main run controller.
   */
  addPendingAbortController(abortController: AbortController): void {
    this.run.addPendingAbortController(abortController);
  }

  removePendingAbortController(abortController: AbortController): void {
    this.run.removePendingAbortController(abortController);
  }

  /**
   * Cancel the current run. Aborts {@link RunCoordinator.currentAbortController}
   * (the same identity wired into TanStack `chat` by {@link prepareForRun}) and
   * any pending tool controllers.
   */
  abort(reason?: string): void {
    abortManagedAgentRun(this, reason);
    this.cascadeAbortToChildren(reason);
  }

  /**
   * Abort actively running child subagents so a parent stop (server/extension
   * hosts dispatching stop directly, force-submit) does not leave detached
   * tasks streaming in the background. Idle/completed children are untouched.
   */
  private cascadeAbortToChildren(reason?: string): void {
    const manager = this.manager;
    if (!manager || this.childIds.length === 0) return;
    for (const childId of [...this.childIds]) {
      const child = manager.getAgent(childId);
      if (!child) continue;
      const status = child.status;
      if (status !== "running" && status !== "compacting" && status !== "thinking" && status !== "responding") {
        continue;
      }
      try {
        child.abort(reason ?? "parent-aborted");
      } catch {
        // Never let a cascade failure break the parent's own abort path.
      }
    }
  }

  isAbortError(err: unknown): boolean {
    return this.run.isAbortError(err);
  }

  async handleReactiveCompact(error: unknown, manager: AgentManager): Promise<boolean> {
    return handleManagedReactiveCompact(this, error, manager);
  }

  /** Model input context window in tokens, if known (compaction keep policy). */
  get contextWindow(): number | undefined {
    return this.modelInfo?.contextWindow ?? undefined;
  }
  /**
   * Manual context compaction (AgentSession `compact` / `/compact`).
   * Requires {@link manager} to be set (bootstrap always attaches it for root agents).
   */
  async compact(options?: { focus?: string; messages?: TanStackUIMessage[] }): Promise<
    | {
        ok: true;
        message: string;
        tokensBefore?: number;
        tokensAfter?: number;
      }
    | { ok: false; error: string }
  > {
    const manager = this.manager;
    if (!manager) {
      return { ok: false, error: "AgentManager required for compact" };
    }
    return runManualCompact(
      {
        id: this.id,
        status: this.status,
        setStatus: (status, trigger) => this.setStatus(status, trigger ?? "manual-compact"),
        ui: this.ui,
        usage: this.usage,
        todoManager: this.todoManager,
        statusController: this.statusController,
        compactionConfig: this.compaction.getConfig(),
        contextWindow: this.modelInfo?.contextWindow,
        resetAdmittedTurnContext: () => this.resetAdmittedTurnContext(),
        resetSystemPrompt: () => this.resetSystemPrompt(),
        persistSession: () => this.persistSession(),
        maybeSaveSessionUIMessages: (messages, reason) => this.maybeSaveSessionUIMessages(messages, reason),
        getLog: () => this.log,
      },
      manager,
      options
    );
  }

  async restoreSession(sessionId: string): Promise<SessionData> {
    const manager = this.manager;
    // Disk-session ownership check: refuse to resume a session already held by
    // another live agent. Idempotent for the same agent (re-resume is allowed).
    if (manager && !manager.acquireSessionOwnership(sessionId, this.id)) {
      throw new Error(`Session "${sessionId}" is already active in another live session and cannot be resumed here.`);
    }
    try {
      return await restoreManagedSession(this, sessionId);
    } catch (err) {
      // Roll back ownership so a failed restore (e.g. missing session) doesn't
      // leave a stale claim.
      manager?.releaseSessionOwnership(sessionId, this.id);
      throw err;
    }
  }

  isToolNeedsApproval(toolName: string): boolean {
    const tools = this.extensions.getManagedToolsProvider()?.() ?? {};
    const tool = tools[toolName];
    return tool != null && "needsApproval" in tool && (tool as { needsApproval?: boolean }).needsApproval === true;
  }

  /** Create or replace the core-owned main chat session (StreamProcessor + run loop). */
  initChat(manager: AgentManager, initialMessages?: TanStackUIMessage[]): AgentChatController {
    this.chatController = new AgentChatController(this, manager, initialMessages);
    this.resetSessionSyncTracker(initialMessages);
    return this.chatController;
  }

  getChatController(): AgentChatController | undefined {
    return this.chatController;
  }

  /** Drop steer/follow-up queues without clearing the transcript. */
  clearQueuedMessages(): void {
    this.chatController?.clearQueuedMessages();
  }

  reset(): void {
    const prevStatus = this.status;
    this.log?.info("agent", "Resetting agent", {
      previousStatus: prevStatus,
      hadTodos: this.todoManager?.hasTodos() ?? false,
    });
    // Exit plan / auto-approve first so approval bypass cannot stick across sessions.
    this.planMode.disable();
    this.setAutoModeEnabled(false);
    this.approvals.clear();
    this.run.resetRunState();
    this.compaction.resetReactiveCompactRetries();
    this.statusController.resetToIdle();
    this.setError("");
    this.retryInfo = null;
    this.pendingApprovalCount = 0;
    this.memory.resetState();
    this.pendingExtensionTurnContextSections = undefined;
    this.usage.reset();
    this.todoManager?.reset();
    this.run.resetTurnLifecycle();
    // Keep chatController + uiChannel alive — /clear calls clearMessages() separately.
    // Resetting these would break subsequent sendMessage() calls.
    this.lastAdmittedTurnContextHashes = undefined;
    this.systemPromptFrozen = false;
    this.frozenSystemPrompt = undefined;
  }

  // ============================================================================
  // Package-internal runner / adapter / UI wiring
  // ============================================================================

  /** @internal Used by run-agent / stream recovery. */
  getRunner(): AgentRunner | undefined {
    return this.runner;
  }

  /** @internal */
  setRunner(runner: AgentRunner | undefined): void {
    this.runner = runner;
  }

  /** @internal */
  getRunnerConfigKey(): string | undefined {
    return this.runnerConfigKey;
  }

  /** @internal */
  setRunnerConfigKey(key: string | undefined): void {
    this.runnerConfigKey = key;
  }

  /** @internal Invalidate cached AgentRunner (tools / plan phase / prompt changed). */
  invalidateRunner(): void {
    this.runner = undefined;
    this.runnerConfigKey = undefined;
  }

  /** @internal */
  getTextAdapter(): TextAdapterConfig | undefined {
    return this.textAdapter;
  }

  /** @internal */
  setTextAdapter(adapter: TextAdapterConfig | undefined): void {
    this.textAdapter = adapter;
  }

  /** @internal Wire chat / subagent UI channel (hosts read via {@link ui}). */
  setUIChannel(ui: AgentUIChannel | undefined): void {
    this.approvalRequestUnsub?.();
    this.approvalRequestUnsub = undefined;
    this.uiChannel = ui;
    if (ui) {
      this.approvalRequestUnsub = ui.subscribeApprovalRequests((request) => {
        if (!request.approvalId || !request.toolCallId) return;
        this.approvals.upsert({
          id: request.approvalId,
          toolCallId: request.toolCallId,
          status: "pending",
        });
      });
    }
    this.stateEvents.emit("ui", ui);
  }
}

export function createManagedAgentTimestamps(): Pick<ManagedAgent, "createdAt" | "updatedAt" | "childIds"> {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, childIds: [] };
}
