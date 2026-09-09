import { getToUI } from "@my-agent/core";
import { Box, Text } from "ink";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { useTranscriptDisplayMode } from "../context/transcript-display-context.js";
import { useSize } from "../hooks";
import { BG, COLORS } from "../theme/colors.js";
import { formatToolOutput } from "../utils/format";
import { splitStreamingLines } from "../utils/streaming-output-lines.js";

import { TodoToolOutputView } from "./TodoToolOutputView.js";

import type { UiToolState } from "../utils/tool-part.js";
import type { TodoItem } from "@my-agent/core";
import type { ToolCallPart } from "@tanstack/ai";

/** Built-in tools that always render a detailed output block. */
const DETAILED_OUTPUT_TOOLS = new Set([
  "run_command",
  "get_command_output",
  "kill_command",
  "task",
  "ask_user",
  "todo",
  "complete_plan",
]);

/** In compact mode, only these keep a detailed output block (interactive / structured UI). */
const COMPACT_DETAILED_OUTPUT_TOOLS = new Set(["ask_user", "todo"]);

export const ToolOutputView = ({ part, uiState }: { part: ToolCallPart; uiState: UiToolState }) => {
  const mode = useTranscriptDisplayMode();
  const screenWidth = useSize((s) => s.state.screenWidth);
  const toolName = part.name;

  if (uiState !== "output-available" && uiState !== "output-error") return null;

  if (mode === "compact" && !COMPACT_DETAILED_OUTPUT_TOOLS.has(toolName)) {
    return null;
  }

  // Rich block background: message container paddingX=1 + tool column
  // paddingLeft=2 → width compensates so the right edge aligns with user
  // message boxes (screenWidth - 2).
  const boxWidth = Math.max(screenWidth - 4, 1);

  if (toolName === "todo") {
    const output = part.output as { items?: TodoItem[]; title?: string; source?: "plan" | "agent" };
    if (!output.items) return null;
    return (
      <HalfLinePaddedBox backgroundColor={BG.toolResult} width={boxWidth}>
        <TodoToolOutputView items={output.items} title={output.title} source={output.source} />
      </HalfLinePaddedBox>
    );
  }

  if (toolName === "ask_user" && uiState === "output-error") return null;

  const isBuiltinDetailed = DETAILED_OUTPUT_TOOLS.has(toolName);
  const output = formatToolOutput(part.output, toolName);

  // Extension (and other) tools: show the default block only when toUI produced non-empty text.
  if (!isBuiltinDetailed) {
    if (!getToUI(toolName) || !output.trim()) return null;
  }

  const lines = splitStreamingLines(output);
  const failed = toolName === "run_command" && (part.output as { success?: boolean } | undefined)?.success === false;
  const lineColor = failed ? COLORS.danger : COLORS.muted;

  return (
    <HalfLinePaddedBox backgroundColor={BG.toolResult} width={boxWidth}>
      <Box flexDirection="column" paddingLeft={2}>
        {lines.map((line, i) => (
          <Text key={i} color={lineColor} dimColor={!failed}>
            {line.length > 0 ? line : " "}
          </Text>
        ))}
      </Box>
    </HalfLinePaddedBox>
  );
};
