import { isContentPartArray } from "@tanstack/ai";

import { serializeToolMessageContent } from "../message-utils.js";

import type { ContentPart, ModelMessage } from "@tanstack/ai";

/** Normalize tool output for ModelMessage `content` (string or ContentPart[]). */
export function normalizeModelToolContent(result: unknown): string | ContentPart[] {
  if (typeof result === "string") return result;
  if (isContentPartArray(result)) return result;
  if (result === undefined || result === null) return "";
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/** Parse structured tool output from a model tool message for `toModelOutput`. */
export function parseToolMessageOutput(content: ModelMessage["content"]): unknown {
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  if (isContentPartArray(content)) {
    return content;
  }

  if (content === null || content === undefined) {
    return null;
  }

  const serialized = serializeToolMessageContent(content);
  try {
    return JSON.parse(serialized);
  } catch {
    return serialized;
  }
}

/** Extract `cachedOutputPath` from a parsed tool output object, if present. */
export function extractCachedOutputPath(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const path = (output as Record<string, unknown>).cachedOutputPath;
  return typeof path === "string" && path.length > 0 ? path : null;
}

/**
 * TanStack approval continuation marker — tool is approved but not executed yet.
 * Must not be compacted or passed through `toModelOutput`; doing so strips
 * `pendingExecution` and the engine skips the real tool run.
 */
export function isPendingToolExecutionResult(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  return (output as Record<string, unknown>).pendingExecution === true;
}

/**
 * TanStack `output-error` tool results — `{ error: string }` from server execution.
 * Must not pass through success-only `toModelOutput` handlers (they treat missing
 * fields as success and emit misleading text like "Overwrote file: undefined").
 */
export function isToolErrorResult(output: unknown): boolean {
  if (isPendingToolExecutionResult(output)) return false;

  if (output && typeof output === "object" && "error" in output) {
    const error = (output as Record<string, unknown>).error;
    return typeof error === "string" && error.length > 0;
  }

  if (typeof output === "string") {
    return output.startsWith("Error executing tool:");
  }

  return false;
}

/** Extract a human-readable error message from a tool error payload. */
export function extractToolErrorMessage(output: unknown): string {
  if (output && typeof output === "object" && "error" in output) {
    const error = (output as Record<string, unknown>).error;
    if (typeof error === "string" && error.length > 0) return error;
  }

  if (typeof output === "string") {
    if (output.startsWith("Error executing tool:")) {
      return output.slice("Error executing tool:".length).trim();
    }
    return output;
  }

  return "Tool execution failed";
}

/** LLM-facing shape for failed tool results (preserves failure semantics). */
export function formatToolErrorForModel(output: unknown): string | ContentPart[] {
  return [{ type: "text", content: `Error: ${extractToolErrorMessage(output)}` }];
}
