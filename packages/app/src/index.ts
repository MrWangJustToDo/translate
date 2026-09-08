// Adapter
export * from "./adapter/types.js";
export {
  createAgentFromConfig,
  createSessionOnHost,
  clearAgentStore,
  bindAgentSession,
  type CreateAgentOptions,
} from "./adapter/create-agent.js";

// Context
export { AdapterProvider, useAdapter } from "./context/adapter-context.js";

// App
export { App } from "./app/App.js";
export { Agent } from "./app/Agent.js";

// Components
export { StreamingOutputView } from "./messages/StreamingOutputView.js";
export { ConfigEditor, STYLE_OPTIONS, type ConfigEditorProps } from "./components/ConfigEditor.js";

// Hooks
export * from "./hooks";

// Commands
export {
  clearExtensionCommands,
  dispatchCommand,
  getAllCommands,
  getCommand,
  registerExtensionCommand,
  splitExtensionCommandArgs,
  syncExtensionCommands,
  COMMAND_FREEFORM_VALUE,
  typedArgsAfterCommand,
  withFreeformOption,
} from "./commands";
export type { Command, CommandContext, CommandOption } from "./commands";

// Utils
export { formatToolInput, formatToolOutput, formatToolArgs, formatDuration } from "./utils/format.js";
export {
  getToolCallColor,
  getInlineSummary,
  getCompactOutput,
  buildToolHeader,
  getDurationMs,
  DURATION_THRESHOLD_MS,
} from "./utils/format.js";
export {
  dedupeToolCallsInMessages,
  mergeToolCallPart,
  computeToolCallsRenderSignature,
  normalizeToolPartsInMessages,
  shouldFlattenPart,
} from "./utils/dedupe-tool-calls.js";
export { getUiToolState, isToolCallPart, isToolExecuting, parseToolInput } from "./utils/tool-part.js";
export { truncateTextToMaxLines, wrapTextToLines } from "./utils/user-message-lines.js";
export {
  CONVERSATION_SUMMARY_START,
  CONVERSATION_SUMMARY_END,
  extractCompactionSummaryBody,
  formatCompactionSummaryContent,
  hasOuterEndMarker,
  isCompactionSummaryText,
  isCompactionSummaryUIMessage,
} from "./utils/compaction-summary.js";

// Types
export type { Attachment } from "./types/attachment.js";

export { initHighlighter } from "ink-stream-markdown";
export { configureEnv } from "reactivity-store";
