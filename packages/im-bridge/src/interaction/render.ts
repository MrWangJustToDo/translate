/**
 * Reply rendering — projects UIMessage[] onto bridge primitives.
 *
 * Scanning conditions mirror the app layer (packages/app/src/utils/tool-part.ts
 * getUiToolState + use-agent-chat's pending interaction scan):
 * - pending ask_user: `part.name === "ask_user" && part.output === undefined`
 *   (input fully received, no answer yet)
 * - pending approval: `part.approval.needsApproval && part.approval.approved === undefined`
 */

import type { PendingInteraction } from "../types.js";
import type { ToolCallPart, UIMessage } from "@tanstack/ai";

const ASK_USER_TOOL = "ask_user";
const SUMMARY_INPUT_LIMIT = 96;

export interface RenderedReply {
  /** Assistant text plus collapsed tool status lines. */
  text: string;
  /** Interactions awaiting a user answer, in message order. */
  pending: PendingInteraction[];
}

function isToolCallPart(part: UIMessage["parts"][number]): part is ToolCallPart {
  return part.type === "tool-call";
}

function parseInputJson(part: ToolCallPart): Record<string, unknown> | undefined {
  if (part.input !== undefined) {
    return typeof part.input === "object" && part.input !== null ? (part.input as Record<string, unknown>) : undefined;
  }
  if (!part.arguments) return undefined;
  try {
    const parsed = JSON.parse(part.arguments) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function summarizeToolInput(part: ToolCallPart): string {
  const input = parseInputJson(part);
  if (!input) return part.name;
  const summary = JSON.stringify(input);
  const truncated = summary.length > SUMMARY_INPUT_LIMIT ? `${summary.slice(0, SUMMARY_INPUT_LIMIT - 1)}…` : summary;
  return `${part.name}: ${truncated}`;
}

function isFailedOutput(part: ToolCallPart): boolean {
  return (
    typeof part.output === "object" && part.output !== null && (part.output as { success?: boolean }).success === false
  );
}

/** Compact status line for a tool call (`📎 run_command · running`). */
function toolStatusLine(part: ToolCallPart): string {
  if (part.approval?.approved === false) return `📎 ${part.name} · ✗ denied`;
  if (part.output !== undefined) {
    if (part.state === "error" || isFailedOutput(part)) return `📎 ${part.name} · ✗`;
    return `📎 ${part.name} · ✓`;
  }
  if (part.approval?.needsApproval && part.approval.approved === undefined) {
    return `📎 ${part.name} · ⏸ awaiting approval`;
  }
  return `📎 ${part.name} · running`;
}

/** Scan messages for interactions that need a user answer. */
export function scanPendingInteractions(messages: UIMessage[]): PendingInteraction[] {
  const pending: PendingInteraction[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolCallPart(part)) continue;
      if (part.name === ASK_USER_TOOL && part.state === "input-complete" && part.output === undefined) {
        const input = parseInputJson(part) ?? {};
        pending.push({
          kind: "ask_user",
          toolCallId: part.id,
          question: typeof input.question === "string" ? input.question : "(no question)",
          options: Array.isArray(input.options) ? input.options.filter((o): o is string => typeof o === "string") : [],
          multiSelect: input.multiSelect === true,
        });
        continue;
      }
      if (part.approval?.needsApproval && part.approval.approved === undefined) {
        pending.push({
          kind: "approval",
          approvalId: part.approval.id,
          toolName: part.name,
          question: summarizeToolInput(part),
        });
      }
    }
  }
  return pending;
}

/** Render the current reply state: last assistant text + tool status lines + pending interactions. */
export function renderReply(messages: UIMessage[]): RenderedReply {
  const pending = scanPendingInteractions(messages);

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const lines: string[] = [];
  if (lastAssistant) {
    for (const part of lastAssistant.parts) {
      if (part.type === "text") {
        if (part.content.trim().length > 0) lines.push(part.content);
      } else if (isToolCallPart(part)) {
        lines.push(toolStatusLine(part));
      }
    }
  }

  return { text: lines.join("\n\n").trim(), pending };
}

/** Render the final state of a just-answered interaction (button row cleanup). */
export function renderResolved(question: string, outcome: string): string {
  return `${question}\n\n→ ${outcome}`;
}
