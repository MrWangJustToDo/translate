import { findLastMeaningfulAssistant, isEmptyAssistantShell } from "./empty-assistant-shell.js";
import { isToolCallPart, partTextContent } from "./message-parts.js";

import type { AgentStatus } from "../../runtime-types/agent-status.js";
import type { ModelMessage, ToolCallPart, ToolResultPart, UIMessage } from "@tanstack/ai";

/** Client-side tools — UI supplies output via {@link AgentChatController.addToolResult}. */
const CLIENT_TOOL_NAMES = new Set(["ask_user"]);

function lastAssistantMessage(messages: UIMessage[]): UIMessage | undefined {
  return findLastMeaningfulAssistant(messages);
}

function toolResultIdsForAssistant(assistant: UIMessage): Set<string> {
  return new Set(
    assistant.parts.filter((part): part is ToolResultPart => part.type === "tool-result").map((part) => part.toolCallId)
  );
}

function hasTextAfterTools(assistant: UIMessage): boolean {
  let seenTool = false;
  for (const part of assistant.parts) {
    if (part.type === "tool-call" || part.type === "tool-result") {
      seenTool = true;
      continue;
    }
    if (seenTool && partTextContent(part).trim().length > 0) {
      return true;
    }
  }
  return false;
}

function areAllToolCallsTerminal(assistant: UIMessage): boolean {
  const toolResultIds = toolResultIdsForAssistant(assistant);
  const toolCalls = assistant.parts.filter(isToolCallPart);
  if (toolCalls.length === 0) return false;

  return toolCalls.every((part) => {
    if (isPendingToolApprovalPart(part)) return false;
    if (part.approval?.needsApproval) {
      if (part.approval.approved === false) {
        return toolResultIds.has(part.id);
      }
      if (part.approval.approved === true) {
        return part.state === "complete" || part.output !== undefined || toolResultIds.has(part.id);
      }
      return false;
    }
    return part.state === "complete" || part.output !== undefined || toolResultIds.has(part.id);
  });
}

export function isPendingToolApprovalPart(part: ToolCallPart): boolean {
  return part.approval?.needsApproval === true && part.approval.approved === undefined;
}

/**
 * Non-approval server tools still waiting after batch gating (e.g. `tree` + `run_command`).
 */
export function hasDeferredToolExecution(messages: UIMessage[]): boolean {
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant) return false;

  for (const part of lastAssistant.parts) {
    if (!isToolCallPart(part)) continue;
    if (CLIENT_TOOL_NAMES.has(part.name)) continue;
    if (part.approval?.needsApproval) continue;
    if (part.state === "complete" || part.output !== undefined) continue;
    if (part.state === "input-complete" || part.state === "input-streaming" || part.state === "awaiting-input") {
      return true;
    }
  }
  return false;
}

/** Approved server tools that still need a follow-up tool-phase run. */
export function hasApprovedToolsPendingExecution(messages: UIMessage[]): boolean {
  return hasApprovalRespondedToolsPendingExecution(messages);
}

export function needsToolPhaseContinue(messages: UIMessage[]): boolean {
  return hasDeferredToolExecution(messages) || hasApprovalRespondedToolsPendingExecution(messages);
}

/**
 * Tool results (including synthetic denial) are present but the model has not
 * produced follow-up text for this turn yet. Requires another `chat()` pump.
 */
export function needsAgentResponseAfterTools(messages: UIMessage[]): boolean {
  if (needsToolPhaseContinue(messages)) return false;
  if (hasPendingToolApprovals(messages) || hasPendingAskUser(messages)) return false;

  const toolTurnAssistant = findToolTurnAwaitingFollowUp(messages);
  if (!toolTurnAssistant) return false;

  return !hasMeaningfulFollowUpAssistantAfter(messages, toolTurnAssistant);
}

function findToolTurnAwaitingFollowUp(messages: UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant" || isEmptyAssistantShell(message)) continue;
    if (!message.parts.some(isToolCallPart)) continue;
    if (!areAllToolCallsTerminal(message)) continue;
    if (hasTextAfterTools(message)) continue;
    return message;
  }
  return undefined;
}

function hasMeaningfulFollowUpAssistantAfter(messages: UIMessage[], toolTurnAssistant: UIMessage): boolean {
  const toolTurnIndex = messages.indexOf(toolTurnAssistant);
  if (toolTurnIndex === -1) return false;

  for (let i = toolTurnIndex + 1; i < messages.length; i++) {
    const message = messages[i];
    if (message.role !== "assistant" || isEmptyAssistantShell(message)) continue;
    if (message.parts.some((part) => partTextContent(part).trim().length > 0)) {
      return true;
    }
  }

  return false;
}

/** Whether {@link AgentChatController} should invoke another `runAgentStream`. */
export function shouldContinueAgentPump(messages: UIMessage[]): boolean {
  return needsToolPhaseContinue(messages) || needsAgentResponseAfterTools(messages);
}

export function hasPendingToolApprovals(messages: UIMessage[]): boolean {
  return countPendingToolApprovals(messages) > 0;
}

export function countPendingToolApprovals(messages: UIMessage[]): number {
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant) return 0;

  let count = 0;
  for (const part of lastAssistant.parts) {
    if (!isToolCallPart(part)) continue;
    if (isPendingToolApprovalPart(part)) count++;
  }
  return count;
}

/** Approved server tools that still need execution in a follow-up `chat()` run. */
export function hasApprovalRespondedToolsPendingExecution(messages: UIMessage[]): boolean {
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant) return false;

  const toolResultIds = toolResultIdsForAssistant(lastAssistant);

  for (const part of lastAssistant.parts) {
    if (!isToolCallPart(part)) continue;
    if (!part.approval?.needsApproval || part.approval.approved !== true) continue;
    if (part.state === "complete" || part.output !== undefined) continue;
    if (toolResultIds.has(part.id)) continue;
    return true;
  }
  return false;
}

/**
 * Whether `prepareForRun` should skip expensive one-shot work (memory prefetch, `prompt:submit`).
 *
 * Uses existing agent status plus conversation shape — no separate run-phase flag:
 * - `waiting` — stream paused for tool approval
 * - last message is not `user` — tool-phase or approval continuation within the same turn
 */
export function isToolContinuationPrepare(status: AgentStatus, messages?: Array<UIMessage | ModelMessage>): boolean {
  if (status === "waiting" || status === "awaiting_user") return true;
  if (!messages?.length) return false;
  return messages[messages.length - 1].role !== "user";
}

export function hasPendingAskUser(messages: UIMessage[]): boolean {
  const lastAssistant = lastAssistantMessage(messages);
  if (!lastAssistant) return false;

  for (const part of lastAssistant.parts) {
    if (!isToolCallPart(part)) continue;
    if (part.name !== "ask_user") continue;
    if (part.state === "input-complete" && part.output === undefined) return true;
  }
  return false;
}
