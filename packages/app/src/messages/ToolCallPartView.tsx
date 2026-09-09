import { Box, Text } from "ink";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { Spinner } from "../components/Spinner.js";
import { useTranscriptDisplayMode } from "../context/transcript-display-context.js";
import { useSize } from "../hooks";
import { useSummaryStream } from "../hooks/use-summary-stream.js";
import { useTask } from "../hooks/use-task.js";
import { useToolElapsed } from "../hooks/use-tool-elapsed.js";
import { BG, COLORS } from "../theme/colors.js";
import { formatUsageBrief } from "../utils/format-usage.js";
import {
  buildToolHeader,
  DURATION_THRESHOLD_MS,
  formatDuration,
  formatToolInput,
  // getCompactOutput, // temporarily commented out with the error block below
  getDurationMs,
  getInlineSummary,
  getToolCallColor,
  LIVE_DURATION_THRESHOLD_MS,
} from "../utils/format.js";
import { formatRetryStatus } from "../utils/retry-status.js";
import { getUiToolState, isToolExecuting, parseToolInput } from "../utils/tool-part.js";

import { StreamingOutputView } from "./StreamingOutputView.js";
import { SummaryStreamView } from "./SummaryStreamView.js";
import { ToolInputView } from "./ToolInputView.js";
import { ToolOutputView } from "./ToolOutputView.js";
import { ToolStatusIcon } from "./ToolStatusIcon.js";

import type { ToolCallPart } from "@tanstack/ai";

function extractErrorText(part: ToolCallPart): string | null {
  const uiState = getUiToolState(part);
  if (uiState === "output-denied") {
    const approvalReason = (part.approval as { reason?: string } | undefined)?.reason;
    if (approvalReason) return approvalReason;

    const output = part.output;
    if (output && typeof output === "object" && "message" in output) {
      return String((output as { message?: unknown }).message ?? "Denied");
    }
    if (output && typeof output === "object" && "error" in output) {
      return String((output as { error?: unknown }).error ?? "Denied");
    }
    return "Denied";
  }
  if (uiState === "output-error") {
    const output = part.output;
    if (output && typeof output === "object" && "error" in output) {
      return String((output as { error?: unknown }).error);
    }
    return "Tool error";
  }
  return null;
}

export interface ToolCallPartViewProps {
  part: ToolCallPart;
  readOnly?: boolean;
  /** Throttle for live `run_command` / `task` stream UI updates (ms). Default: 100 for run_command, 0 for task. */
  streamingThrottleMs?: number;
}

const RUN_COMMAND_STREAM_THROTTLE_MS = 100;

/** Render a tool invocation part — unified compact style for all tools */
export const ToolCallPartView = ({ part, streamingThrottleMs }: ToolCallPartViewProps) => {
  const displayMode = useTranscriptDisplayMode();
  const uiState = getUiToolState(part);
  const toolName = part.name;
  const toolCallId = part.id;
  const toolInput = parseToolInput(part);

  const isRunCommand = toolName === "run_command";
  const isTask = toolName === "task";
  const isExecuting = isToolExecuting(part);
  const screenWidth = useSize((s) => s.state.screenWidth);
  // Same box metrics as ToolOutputView: message container paddingX=1 + tool
  // column paddingLeft=2 → width compensates so the right edge aligns with
  // user message boxes (screenWidth - 2).
  const boxWidth = Math.max(screenWidth - 4, 1);
  const liveElapsedMs = useToolElapsed(toolCallId, isExecuting, LIVE_DURATION_THRESHOLD_MS);
  const {
    phase: taskPhase,
    usage: taskUsage,
    retry: taskRetry,
  } = useTask({
    taskId: isTask ? part.id : "",
  });
  // Authoritative per-task phase machine (running → summary): `begin_summary`
  // and the progress-summary fallback both transition it, so the panel view
  // no longer depends on message inference.
  const showTaskSummaryStream = isTask && isExecuting && taskPhase === "summary";
  const taskSummary = useSummaryStream({
    source: "task",
    toolCallId: isTask ? toolCallId : undefined,
    enabled: showTaskSummaryStream,
    maxLines: 5,
  });

  const displayInput =
    toolInput === undefined || toolInput === null
      ? null
      : formatToolInput(toolInput, toolName, { compact: displayMode === "compact" }) || null;

  const hasOutput = uiState === "output-available" || uiState === "output-error" || uiState === "output-denied";
  const hasDenied = uiState === "output-denied";
  const durationMs = hasOutput ? getDurationMs(part.output) : null;
  const showDuration = durationMs !== null && durationMs >= DURATION_THRESHOLD_MS;

  const errorText = extractErrorText(part);
  const inlineSummary = errorText ? null : getInlineSummary(part, toolName);
  const outputFailed = (part.output as { success?: boolean } | undefined)?.success === false;
  // Density compact: skip success one-liners; keep failure hints.
  // const compactOutput =
  //   hasOutput && (displayMode !== "compact" || outputFailed || Boolean(errorText))
  //     ? getCompactOutput(part, toolName)
  //     : null;
  const stateColor = errorText || outputFailed ? COLORS.danger : getToolCallColor(uiState);

  // Compact display: errored/denied tools are handled by the compact projection
  // (errors fold into an activity summary count; denied rows are filtered). This
  // render-layer guard still covers the final (live streaming) message, which the
  // projection layer does not process.
  if (displayMode === "compact" && (uiState === "output-error" || uiState === "output-denied")) {
    return null;
  }

  const outputUsage =
    isTask && hasOutput && part.output && typeof part.output === "object" && "usage" in part.output
      ? (part.output as { usage?: { inputTokens?: number; outputTokens?: number } }).usage
      : null;
  // Completed tasks: prefer frozen tool-output usage over live Session totals.
  const displayUsage = hasOutput ? (outputUsage ?? taskUsage) : taskUsage;

  const parenParts: string[] = [];
  if (inlineSummary) parenParts.push(inlineSummary);
  if (showDuration) {
    parenParts.push(formatDuration(durationMs!));
  } else if (liveElapsedMs != null) {
    parenParts.push(formatDuration(liveElapsedMs));
  }
  if (isTask && displayUsage && ((displayUsage.inputTokens ?? 0) > 0 || (displayUsage.outputTokens ?? 0) > 0)) {
    parenParts.push(
      formatUsageBrief({
        inputTokens: displayUsage.inputTokens ?? 0,
        outputTokens: displayUsage.outputTokens ?? 0,
      })
    );
  }
  const parenText = parenParts.length > 0 ? ` (${parenParts.join(", ")})` : "";
  const headerText = buildToolHeader(toolName, displayInput, parenText, stateColor);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box flexDirection="row">
        <Box flexShrink={0} width={2}>
          <ToolStatusIcon state={uiState} toolName={toolName} />
        </Box>
        <Text wrap="wrap">{headerText}</Text>
      </Box>

      {isTask && taskRetry && <Spinner text={formatRetryStatus(taskRetry)} />}

      <ToolInputView part={part} toolInput={toolInput} uiState={uiState} hasError={Boolean(errorText)} />

      {isRunCommand && isExecuting && (
        <StreamingOutputView
          toolCallId={toolCallId}
          enabled={isRunCommand && isExecuting}
          throttleMs={streamingThrottleMs ?? RUN_COMMAND_STREAM_THROTTLE_MS}
        />
      )}
      {showTaskSummaryStream && taskSummary.rows.length > 0 && (
        <HalfLinePaddedBox backgroundColor={BG.toolResult} width={boxWidth}>
          <SummaryStreamView rows={taskSummary.rows} height={5} />
        </HalfLinePaddedBox>
      )}

      {hasOutput && <ToolOutputView part={part} uiState={uiState} />}

      {hasDenied && errorText && (
        <Box paddingLeft={2}>
          <Text color={COLORS.danger} wrap="truncate-end">
            {errorText}
          </Text>
        </Box>
      )}
      {/* {compactOutput && !errorText && (
        <Box paddingLeft={2}>
          <Text
            color={(part.output as { success?: boolean } | undefined)?.success === false ? COLORS.danger : COLORS.muted}
            dimColor={(part.output as { success?: boolean } | undefined)?.success !== false}
            wrap="truncate-end"
          >
            {compactOutput}
          </Text>
        </Box>
      )} */}
    </Box>
  );
};
