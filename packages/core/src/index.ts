// ============================================================================
// CoreEnv — register before any core usage
// ============================================================================

export {
  registerCoreEnv,
  clearCoreEnv,
  getEnv,
  hasCoreEnv,
  defaultPath,
  defaultByteLength,
  defaultBase64Encode,
  defaultBase64Decode,
  type CoreEnv,
  type ResolvedCoreEnv,
  type CoreEnvPath,
  type CoreEnvFs,
  type CoreEnvFsStat,
  type CoreEnvExecOptions,
  type CoreEnvExecResult,
  type McpStdioTransportConfig,
  type McpProcessHandle,
} from "./env.js";

// ============================================================================
// LSP transport (optional, Node.js only — feature-detected by LSP extension)
// ============================================================================

export type { LspServerConfig, LspConnection, LspMessage } from "./agent/lsp/lsp-transport.js";
export type { LspConnectionFactory } from "./env.js";
export {
  LspManager,
  type LspServerConfigRecord,
  type ServerStatus,
  type LspClient,
  type LspManagerCallbacks,
} from "./agent/lsp/lsp-manager.js";

// ============================================================================
// Model provider plane (orthogonal to CoreEnv)
// ============================================================================

export {
  registerModelProvider,
  clearModelProvider,
  getModelProvider,
  hasModelProvider,
  createDirectModelProvider,
  type ModelProviderMode,
  type ModelProviderConnection,
  type ModelProvider,
} from "./models/provider/model-provider.js";

export { createRemoteProvider, REMOTE_PROVIDER_API_KEY } from "./models/provider/remote-model-provider.js";

// ============================================================================
// Runtime — agent manager (host bootstrap; Session-only UI must not import ManagedAgent)
// ============================================================================

export { agentManager, AgentManager } from "./managers/agent-manager.js";
export type { AgentEvent, AgentEventListener, AgentEventType, RunAgentStreamInput } from "./managers/agent-manager.js";
export type {
  AgentEventPayloadMap,
  AgentEventPayload,
  EmptyAgentEventPayload,
} from "./runtime-types/agent-event-payloads.js";
export { ManagedAgent, type ManagedAgentConfig, type AgentMode } from "./managers/managed-agent.js";
export { isActiveStatus } from "./runtime-types/agent-status.js";
export type { AgentStatus } from "./runtime-types/agent-status.js";
export type { QueuedMessageContent, QueuedMessagesSnapshot } from "./managers/controllers/agent-chat-controller.js";
export type { PlanModePhase, PlanModeState, BeginPlanExecutionResult } from "./agent/plan/plan-mode-controller.js";
export type { QueueMode } from "./agent/queue/pending-message-queue.js";

// ============================================================================
// Serializable agent state types (Session-safe)
// ============================================================================

export type { TokenUsage } from "./agent/compaction";
export type { LogEntry, LogCategory, LogLevel } from "./agent/agent-log";
export type { TodoItem, TodoStatus, TodoPriority } from "./agent/todo";
export type { SessionMeta, SessionData, ResumeResult, ToolApprovalRecord } from "./agent/persistence";
export type { UsageRecord, UsageRecordInput } from "./agent/usage/usage-store";
export type { DailyUsageBucket, ModelUsageTotal, UsageHistoryResult } from "./agent/usage/usage-store";

// ============================================================================
// Agent Session API (host-facing transport-agnostic surface)
// ============================================================================

export {
  AGENT_SESSION_CHANNELS,
  DEFAULT_AGENT_SESSION_CHANNELS,
  createLocalAgentSession,
  createLocalAgentSessionHost,
  sessionForSubagent,
  type AgentSession,
  type AgentSessionChannel,
  type AgentSessionCommand,
  type AgentSessionCommandResult,
  type AgentSessionCreateOptions,
  type AgentSessionCreateResult,
  type AgentSessionEvent,
  type AgentSessionExtensionsSummary,
  type AgentSessionHost,
  type AgentSessionListEntry,
  type AgentSessionMcpSummary,
  type AgentSessionMessageContent,
  type AgentSessionSnapshot,
  type AgentSessionSubagentSummary,
  type AgentSessionSubscribeOptions,
  type AgentSessionSubscriber,
  type CreateLocalAgentSessionHostOptions,
  type CreateLocalAgentSessionOptions,
  type LocalAgentSessionHostManager,
  type LocalAgentSessionManager,
} from "./agent-session";
export type { AgentL1State } from "./managers/managed-agent.js";
export type { AgentRetryState, AgentRetryStrategy } from "./runtime-types/agent-retry.js";
export { TaskRunState, type TaskRunPhase } from "./agent/subagent/task-run-state.js";
export type { UsageChangeSnapshot, UsageSnapshot } from "./managers/telemetry/usage-tracker.js";

// ============================================================================
// Summary streams (task / compact)
// ============================================================================

export {
  SUMMARY_STREAM_SNAPSHOT_LINE_CAP,
  SummaryStreamHub,
  applyAppendToDisplayWindow,
  applySummaryStreamAppend,
  displayWindowFromSnapshot,
  emptySummaryDisplayWindow,
  emptySummaryLineBuffer,
  renderSummaryDisplayRows,
  summaryStreamKey,
  compactSummaryStreamId,
  type SummaryDisplayWindow,
  type SummaryLineBuffer,
  type SummaryStreamEvent,
  type SummaryStreamListener,
  type SummaryStreamResetInput,
  type SummaryStreamSnapshot,
  type SummaryStreamSource,
  type SummaryStreamStatus,
} from "./agent/summary-stream";

// ============================================================================
// Models & agent bootstrap helpers
// ============================================================================

export {
  DEFAULT_BASE_URLS,
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  loadModelEntries,
  loadModels,
  loadModelsConfigFromFile,
  MODELS_CONFIG_DIR,
  MODELS_CONFIG_FILE,
  parseModelStyle,
  parseModelsConfig,
  registerModelProviderForEntry,
  resolveModelConfig,
  resolveModelConfigFromProvider,
  resolveModelConnection,
  resolveModelInfoFromModelsDev,
  resolveModelsConfig,
  resolveModelsConfigFromProvider,
  saveModelsConfig,
} from "./models";
export type {
  DirectModelsConfigEntry,
  LoadedModelEntry,
  LoadedModelsState,
  ModelCapability,
  ModelInfo,
  ModelPricing,
  ModelStyle,
  ModelConnection,
  ModelsConfig,
  ModelsConfigActive,
  ModelsConfigEntry,
  ModelsConfigGlobal,
  ModelsConfigSource,
  ProviderInfo,
  ReasoningConfig,
  ReasoningEffort,
  RemoteProviderConfigEntry,
  ResolvedModelConfig,
  ResolvedModelConfigFromProvider,
} from "./models";
export type { AgentToolConfig, WebsearchToolConfig } from "./agent/tools/tool-config.js";
export { buildDefaultSystemPrompt } from "./agent/prompt/default-prompt.js";
export { DEFAULT_AGENT_MAX_ITERATIONS } from "./managers/agent-types.js";
export { SUBAGENT_NO_TRUNCATE } from "./agent/subagent";
export {
  MEMORY_EXTRACT_MAX_OUTPUT_LENGTH,
  MEMORY_CONSOLIDATE_MAX_OUTPUT_LENGTH,
} from "./agent/memory/memory-extractor.js";
export { resolveSummarizationBudget } from "./agent/compaction";

// ============================================================================
// UI utilities
// ============================================================================

export { previewEdit, type PreviewEditResult } from "./agent/tools/util/preview-edit.js";
export { registerToUI, getToUI, clearToUI } from "./agent/tools/runtime/to-ui-registry.js";

// ============================================================================
// Tool output types (message formatting)
// ============================================================================

export type {
  EditFileOutput,
  GetCommandOutput,
  GlobOutput,
  GrepOutput,
  KillCommandOutput,
  ListFileOutput,
  RunCommandOutput,
  TodoOutput,
  WriteFileOutput,
} from "./agent/tools/util/types.js";
export type { ReadFileOutput } from "./agent/tools/read-file-tool.js";
export type { TaskOutput } from "./agent/subagent/task-tool.js";

// ============================================================================
// CoreEnv errors & workspace I/O types (node / server adapters)
// ============================================================================

export { FileError, ExecutionError } from "./env-types.js";
export type {
  FileEntry,
  FileStat,
  CommandResult,
  RunCommandOptions,
  CommandJobStatus,
  StartCommandOptions,
  StartCommandHandle,
} from "./env-types.js";

// ============================================================================
// Extension types (Session-safe). Loaders/runners stay package-private / `dev.ts`.
// ============================================================================

export type {
  ExtensionAPI,
  ExtensionFactory,
  ExtensionContext,
  ExtensionConfig,
  ExtensionInstance,
  ExtensionToolDefinition,
  ExtensionCommand,
  ExtensionEventBus,
  ExtensionUI,
  ExtensionZod,
  InterceptableEvent,
  EventInterceptor,
  BeforeAgentStartEvent,
  BeforeAgentStartPayload,
  ExtensionPromptAppends,
  ExtensionTurnContextSection,
  ExtensionContextProvider,
  TurnContextProvider,
  ExtensionInfo,
} from "./agent/extension";

// ============================================================================
// Shared utilities
// ============================================================================

export { generateId } from "./utils/generate-id.js";
export type { GenerateIdOptions } from "./utils/generate-id.js";
export { destroyAllCommandJobs } from "./agent/tools/util/command-job-registry.js";
