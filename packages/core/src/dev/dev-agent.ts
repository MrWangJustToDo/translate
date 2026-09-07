/**
 * Internal validation exports — agent domain modules.
 * Aggregated by `dev.ts`; not part of the public API.
 */

export {
  areAllUIMessagesStable,
  computeSessionSyncSnapshot,
  createSessionSyncTracker,
  fingerprintUIMessage,
  isUIMessageStable,
  shouldPersistUIMessages,
} from "../agent/persistence/session-sync-tracker.js";
export type { SessionSaveReason, SessionSyncSnapshot } from "../agent/persistence/session-sync-tracker.js";
export { AgentLog } from "../agent/agent-log/agent-log.js";
export { AgentUIChannel } from "../agent/ui-channel.js";
export {
  findToolCallPart,
  shouldSuppressReplayedToolChunk,
} from "../agent/stream/suppress-replayed-tool-chunks.js";
export { shouldSuppressMessagesSnapshot } from "../agent/stream/suppress-messages-snapshot.js";
export { PendingMessageQueue } from "../agent/queue/pending-message-queue.js";
export type { QueueMode } from "../agent/queue/pending-message-queue.js";
export { SessionStore } from "../agent/persistence/session-store.js";
export { autoCompact } from "../agent/compaction/auto-compact.js";
export { applyCompactionResult } from "../agent/compaction/apply-compaction-result.js";
export { isPromptTooLongError, reactiveCompact } from "../agent/compaction/reactive-compact.js";
export { extractRunErrorMessage, throwOnRunError } from "../agent/stream/stream-errors.js";
export { formatReadFileToolResult } from "../agent/tools/util/format-read-file-result.js";
export {
  estimateImageInputTokens,
  estimateImageTokensFromDimensions,
  tryReadImageDimensions,
} from "../models/estimate-image-tokens.js";
export {
  applyResolvedEdit,
  expandMatchVariants,
  formatNotFoundHint,
  resolveEditMatch,
  START_LINE_TOLERANCE,
  unescapeCommonEscapes,
} from "../agent/tools/util/find-edit-match.js";
export { BEGIN_SUMMARY_TOOL_NAME } from "../agent/subagent/begin-summary-tool.js";
export { buildExploreSystemPrompt, SUBAGENT_EXPLORE_SYSTEM_PROMPT } from "../agent/subagent/explore-prompt.js";
export {
  mcpContentHasMultimodal,
  mcpContentToTanstack,
  resolveMcpToolExecuteResult,
  wrapMcpToolForMultimodalContent,
} from "../agent/mcp/prefer-multimodal-content.js";
export {
  extractAssistantText,
  getSummaryStreamText,
  resolveTaskRunPhase,
  shouldStreamTaskSummary,
} from "../agent/stream/extract-assistant-text.js";
export { countSubagentIterations, deriveSubagentRunStats, hasBeginSummaryCall } from "../agent/subagent/run-stats.js";
export {
  applySubagentCancelNotice,
  SUBAGENT_CANCELLED_NOTICE,
  truncateSummary,
} from "../agent/subagent/subagent-output.js";
export {
  buildProgressSummaryPrompt,
  isProgressSummaryEligible,
  PROGRESS_SUMMARY_MARKER,
  summarizeProgress,
} from "../agent/subagent/progress-summary.js";
export { resolveSubagentBridgeUI } from "../agent/subagent/types.js";
export { MAX_ACTIVE_TASK_PREFORKS, TaskPreforkCoordinator } from "../agent/subagent/task-prefork.js";
export {
  beginTaskRun,
  clearTaskRuns,
  enterTaskSummaryPhase,
  getTaskRunState,
  readTaskRunPhase,
  TaskRunState,
} from "../agent/subagent/task-run-state.js";
export {
  consumeAgentStream,
  ensureUIChannel,
  runAgentOnce,
  type RunAgentOnceOutcome,
} from "../agent/run/run-agent-skeleton.js";
export { extractFileOpsFromMessages, formatFileOperations } from "../agent/compaction/file-ops-tracker.js";
export { buildDefaultSystemPrompt } from "../agent/prompt/default-prompt.js";
export { PR_SUMMARY_SYSTEM_PROMPT, TITLE_SYSTEM_PROMPT } from "../agent-session/session-summary-prompt.js";
export { assertNotCompactionSummaryInput, applyToolCompact, ToolCompactCache, toModelOutputRegistry } from "../agent/compaction";
export {
  buildCompactArchiveMarkdown,
  buildCompactionPrompt,
  buildSegmentedConversationText,
  buildSummarizationUserPrompt,
  COMPACT_TRANSCRIPT_ROOT,
  COMPACTION_PROMPT,
  COMPACTION_SYSTEM_PROMPT,
  deriveKeepRecentTokens,
  extractCompactArchivePaths,
  findCutPoint,
  findCutPointByBudget,
  formatCompactArchivesSection,
  createCompactionSummaryUIMessage,
  findLatestSummaryIndex,
  formatCompactionSummaryContent,
  extractCompactionSummaryBody,
  getModelVisibleMessages,
  isCompactionSummaryModelMessage,
  isCompactionSummaryText,
  isCompactionSummaryUIMessage,
  isLatestDurableMessageCompactionSummary,
  keepPolicyProjectionOptions,
  lastMessageContentLen,
  maybeAppendCompactArchive,
  parseCompactSequence,
  policyKeyFromOptions,
  resolveAutoCompactTrigger,
  resolveKeepPolicy,
  serializeConversation,
  STILL_IN_CONTEXT_RULES,
  stripCompactArchiveSections,
  TURN_PREFIX_INSTRUCTION,
  UPDATE_COMPACTION_PROMPT,
  WireProjectionCache,
  wireSourceFingerprint,
  writeCompactArchive,
} from "../agent/compaction";
export { extractTextFromContent } from "../agent/compaction/message-utils.js";
export {
  createTimeoutAbort,
  filterResultsByDomain,
  getProviderManager,
  initializeProviders,
  resetWebsearchProviders,
} from "../agent/tools/websearch";
export { resolveSelectedMemoryFilename } from "../agent/memory/memory-retrieval.js";
export { MemoryManager } from "../agent/memory/memory-manager.js";
export { extractMemories, consolidateMemories } from "../agent/memory/memory-extractor.js";
export { findRelevantMemories, formatRelevantMemories } from "../agent/memory/memory-retrieval.js";
export type { RelevantMemory } from "../agent/memory/memory-retrieval.js";
export {
  DEFAULT_SUMMARIZATION_CONTEXT_WINDOW,
  resolveSummarizationInputBudget,
  splitMessagesByTokenBudget,
} from "../agent/compaction/summarization-budget.js";
export { estimateTokens } from "../agent/compaction/token-estimator.js";
export {
  ToolApprovalTable,
  approvalsToResumeMap,
  backfillApprovalsFromUIMessages,
  normalizeSessionApprovals,
} from "../agent/approval/tool-approval-table.js";
export {
  ExtensionLoader,
  ExtensionRunner,
  normalizeExtensionExport,
  isExtensionModuleFile,
  pathToFileUrl,
  DEFAULT_EXTENSION_DIR,
  getDefaultExtensionDirs,
} from "../agent/extension";
export { buildAutoModePrompt } from "../agent/approval/auto-mode-prompt.js";
export {
  CONTEXT_OPEN_PREFIX,
  CONTEXT_CLOSE,
  hashTurnContextPayload,
  formatContextSectionUserContent,
  isContextText,
  contextKindFromText,
  isContextModelMessage,
  isContextUIMessage,
  extractContextSection,
  hashTurnContextSection,
  findLatestTurnContextSectionHashes,
} from "../agent/turn-context";
export {
  INSTRUCTION_FILENAMES,
  INSTRUCTION_MAX_BYTES,
  diffInstructionStates,
  formatInstructionContextSection,
  instructionStateChanged,
  loadLatestInstructionContent,
  readInstructionContextState,
} from "../agent/turn-context";
export type { InstructionContextState, InstructionFile } from "../agent/turn-context";
export { toolsToArray } from "../agent/tools/runtime/tools-record.js";
export {
  createTurnContextMiddleware,
  DEFAULT_REFRESH_MESSAGE_THRESHOLD,
  SUBAGENT_ALLOWED_KINDS,
} from "../managers/middleware/turn-context-middleware.js";
export { injectSyntheticMessages, syntheticMessageId } from "../managers/middleware/synthetic-injection.js";
export { AgentRunner } from "../agent/runner/agent-runner.js";
export { assertAsyncIterable, formatAgentStreamError } from "../agent/stream/assert-async-iterable.js";
export {
  applyToolDenialReason,
  buildToolDenialResultContent,
  DEFAULT_TOOL_DENIAL_MESSAGE,
} from "../agent/stream/apply-tool-denial-reason.js";
export {
  findLastMeaningfulAssistant,
  isEmptyAssistantShell,
  stripEmptyAssistantShells,
} from "../agent/stream/empty-assistant-shell.js";
export {
  EMPTY_MODEL_STREAM_MESSAGE,
  assistantProgressSignature,
  didStreamProduceModelOutput,
  shouldFlagEmptyModelStream,
} from "../agent/stream/empty-model-stream.js";
export {
  TOOL_CANCELLED_MESSAGE,
  cancelIncompleteToolCalls,
  cancelInFlightToolCalls,
  hasCancellableIncompleteToolCalls,
  hasInFlightToolCalls,
  hasValidToolArguments,
  isCancellableIncompleteToolCall,
  isInFlightToolCall,
} from "../agent/stream/incomplete-tool-calls.js";
export {
  MULTIMODAL_OMITTED_PLACEHOLDER,
  MULTIMODAL_PART_CAPABILITY,
  chatMessagesHaveMultimodal,
  isMultimodalUnsupportedError,
  sanitizeMessagesForCapabilities,
  stripMultimodalFromChatMessages,
  trySanitizeForMultimodalRetry,
  unsupportedMultimodalPartTypes,
} from "../models/adapter/capability-message-utils.js";
export type { CapabilityProbe, MultimodalPartType } from "../models/adapter/capability-message-utils.js";
export {
  hasDeferredToolExecution,
  hasApprovedToolsPendingExecution,
  hasApprovalRespondedToolsPendingExecution,
  needsAgentResponseAfterTools,
  needsToolPhaseContinue,
  shouldContinueAgentPump,
  isToolContinuationPrepare,
  countPendingToolApprovals,
} from "../agent/stream/tool-phase-utils.js";
export { isStaleActiveRunStatus, shouldDeferMidRunQueue } from "../agent/queue/defer-mid-run-queue.js";
export { createTanStackSubagentTools, createTanStackTools, getReadOnlyTanStackToolNames } from "../agent/tools/runtime";
export {
  clearStreamingOutput,
  emitStreamingChunk,
  getStreamingSubscriberCounts,
  resetStreamingCallbacksForTests,
  subscribeStreamingCallback,
  subscribeStreamingClearCallback,
} from "../agent/tools/util/streaming-callback.js";
export {
  SUMMARY_STREAM_SNAPSHOT_LINE_CAP,
  SummaryStreamHub,
  applyAppendToDisplayWindow,
  applySummaryStreamAppend,
  displayWindowFromSnapshot,
  emptySummaryDisplayWindow,
  emptySummaryLineBuffer,
  renderSummaryDisplayRows,
  compactSummaryStreamId,
  summaryStreamKey,
} from "../agent/summary-stream";
export { commandJobRegistry } from "../agent/tools/util/command-job-registry.js";
export type { CommandJobRecord, CommandJobPollResult } from "../agent/tools/util/command-job-registry.js";
export {
  PlanModeController,
  cleanStepText,
  extractDoneSteps,
  extractPlan,
  getPlanModeToolExcludeSet,
  getPlanModeToolBlockReason,
  isMcpToolName,
  isPlanModeForbiddenTool,
  PLAN_AUTHORING_TOOL_NAMES,
  PLAN_COMPLETION_TOOL_NAMES,
  PLAN_MODE_EXCLUDED_TOOL_NAMES,
  PLAN_STORE_DIR,
  PLAN_TODO_TITLE,
  formatPlanModeFooterLabel,
  todoProgressFromItems,
  formatStructuredPlanMarkdown,
  formatPlanSummary,
  extractGoalFromPlanMarkdown,
  slugifyPlanName,
  planFilePath,
  stepsFromTexts,
  stripLeadingStepNumber,
  buildModeInactivePrompt,
  buildPlanModePrompt,
  buildPlanModePlanningPrompt,
  buildPlanModeReadyPrompt,
  buildPlanModeRetroPrompt,
  buildPlanRetroSteerMessage,
  createPlanModeMiddleware,
  gateCompletePlanVerification,
  isUsableVerification,
  parseVerificationItemsFromPlanMarkdown,
  parseVerificationItemsFromText,
} from "../agent/plan";
export type {
  BeginPlanExecutionResult,
  ApplyPlanResult,
  PlanModePhase,
  PlanModeState,
  PlanStep,
  ExtractedPlan,
  StructuredPlanInput,
  VerificationResultItem,
} from "../agent/plan";
export { TodoManager } from "../agent/todo";
export {
  getMediaStore,
  resetMediaStore,
  extractBase64Content,
  buildDataUrl,
  sha256Stable,
} from "../agent/media/media-store.js";
export { MediaStore } from "../agent/media/media-store.js";
export type { MediaRef } from "../agent/media/types.js";
export { MEDIA_DIR, mimeToExtension, parseMediaRefPath, buildMediaRefPath } from "../agent/media/types.js";
export { dehydrateUIMessages, hydrateUIMessages } from "../agent/media/media-utils.js";
export {
  repairMessagesSnapshotChunk,
  repairStringifiedMultimodalUIMessages,
  parseStringifiedMultimodalContent,
  isStringifiedMultimodalContentParts,
} from "../agent/media/repair-stringified-multimodal.js";
export { createLspExtension } from "../agent/lsp";
export { DEFAULT_DISABLED_LSP_TOOLS } from "../agent/lsp";
export type { LspExtensionConfig } from "../agent/lsp";
export { EXT_TO_LANGUAGE, getLanguageIdFromPath } from "../agent/lsp/language-map.js";
export {
  LspManager,
  type LspServerConfigRecord,
  type ServerStatus,
  type LspClient,
  type LspManagerCallbacks,
} from "../agent/lsp/lsp-manager.js";
export { findLombokJar } from "../agent/lsp/lombok.js";
export { applyDiagnosticsToToolAfterPayload } from "../agent/lsp/shared/apply-tool-diagnostics.js";
export { extractToolPath, parseToolCallArgs } from "../agent/lsp/shared/parse-tool-args.js";
export { insertDot, shouldSyntheticTrigger, syntheticDotLocks } from "../agent/lsp/shared/synthetic-dot.js";
export { DIAGNOSTIC_SETTLE_DELAY_MS, SYNTHETIC_DOT_SETTLE_DELAY_MS } from "../agent/lsp/shared/timing.js";
export { lspTextToModelOutput } from "../agent/lsp/shared/tool-output.js";
export { createMemoryExtension, type MemoryExtensionConfig, type CreateMemoryExtensionOptions } from "../agent/memory";
export {
  SkillRegistry,
  SkillLoader,
  createSkillsExtension,
  type SkillsExtensionConfig,
  type CreateSkillsExtensionOptions,
} from "../agent/skills";
export { createMcpExtension, type McpExtensionConfig, type CreateMcpExtensionOptions } from "../agent/mcp";
