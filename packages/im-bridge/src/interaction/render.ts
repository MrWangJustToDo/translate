/**
 * Reply rendering — projects the current run of UIMessage[] onto bridge
 * primitives.
 *
 * A "run" is everything after the last user message: one dispatch typically
 * spans SEVERAL assistant messages (one per LLM round), so rendering only the
 * last message would drop earlier rounds' text/tool lines mid-stream.
 *
 * Scanning conditions mirror the app layer (packages/app/src/utils/tool-part.ts
 * getUiToolState + use-agent-chat's pending interaction scan):
 * - pending ask_user: `part.name === "ask_user" && part.state === "input-complete" && part.output === undefined`
 * - pending approval: `part.approval.needsApproval && part.approval.approved === undefined`
 *
 * Tool lines follow the opencode IM convention: `📎 tool · key input info · state`
 * (e.g. `📎 run_command · $ pnpm build · ✓`) — the input summary is the key
 * information, the state suffix is the lifecycle.
 */

import type { PendingInteraction } from "../types.js";
import type { ToolCallPart, UIMessage } from "@tanstack/ai";

const ASK_USER_TOOL = "ask_user";
const INPUT_SUMMARY_LIMIT = 80;
const ERROR_EXCERPT_LIMIT = 200;

export interface RenderedReply {
  /** Assistant text plus collapsed tool status lines, current run only. */
  text: string;
  /** Latest thinking content of the current run ("" once absent) — rendered separately by the runtime. */
  thinking: string;
  /** Interactions awaiting a user answer, in message order. */
  pending: PendingInteraction[];
}

function isToolCallPart(part: UIMessage["parts"][number]): part is ToolCallPart {
  return part.type === "tool-call";
}

/** Messages of the current run: everything after the last user message. */
export function currentRunMessages(messages: UIMessage[]): UIMessage[] {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  return messages.slice(lastUserIndex + 1).filter((message) => message.role === "assistant");
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

function truncate(text: string, limit: number): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > limit ? `${single.slice(0, limit - 1)}…` : single;
}

// ---------------------------------------------------------------------------
// Per-tool input summary (port of packages/app tool-input-format, no chalk)
// ---------------------------------------------------------------------------

function formatFilePathInput(input: Record<string, unknown>, toolName?: string): string {
  const path = input.path as string | undefined;
  if (!path) return "";
  if (toolName === "read_file" && (input.offset !== undefined || input.limit !== undefined)) {
    const offset = typeof input.offset === "number" ? input.offset : undefined;
    const limit = typeof input.limit === "number" ? input.limit : undefined;
    if (offset !== undefined && limit !== undefined) return `${path} lines ${offset}-${offset + limit - 1}`;
    if (offset !== undefined) return `${path} from line ${offset}`;
    if (limit !== undefined) return `${path} first ${limit} lines`;
  }
  return path;
}

function formatRunCommandInput(input: Record<string, unknown>): string {
  const command = input.command as string | undefined;
  if (!command) return "";
  const short = command.length > 56 ? `${command.slice(0, 55)}…` : command;
  const suffix = input.run_in_background === true ? " (background)" : "";
  return `$ ${short}${suffix}`;
}

function formatGrepInput(input: Record<string, unknown>): string {
  const pattern = input.pattern as string | undefined;
  if (!pattern) return "";
  const parts = [JSON.stringify(pattern)];
  if (typeof input.path === "string" && input.path) parts.push(`in ${input.path}`);
  if (typeof input.include === "string" && input.include) parts.push(`--include=${input.include}`);
  return parts.join(" ");
}

function formatGenericInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  if (typeof input === "string") return truncate(input, 50);
  if (typeof input !== "object") return "";
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return "";
  const formatted = entries
    .slice(0, 2)
    .map(([key, value]) => {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      return `${key}=${truncate(strValue, 30)}`;
    })
    .join(", ");
  return entries.length > 2 ? `(${formatted}, ...)` : `(${formatted})`;
}

/** Key information of a tool call's input, keyed by tool name. */
export function formatInputSummary(toolName: string, input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  switch (toolName) {
    case "read_file":
    case "list_file":
    case "write_file":
    case "edit_file":
    case "delete_file":
      return formatFilePathInput(input, toolName);
    case "run_command":
      return formatRunCommandInput(input);
    case "grep":
      return formatGrepInput(input);
    case "glob": {
      const pattern = input.pattern as string | undefined;
      if (!pattern) return "";
      const parts = [JSON.stringify(pattern)];
      if (typeof input.path === "string" && input.path) parts.push(`in ${input.path}`);
      return parts.join(" ");
    }
    case "task": {
      const description = input.description as string | undefined;
      const prompt = input.prompt as string | undefined;
      if (description) return truncate(description, 60);
      if (prompt) return truncate(prompt, 60);
      return "";
    }
    case "todo":
      return (input.title as string | undefined) ?? "";
    case "websearch":
      return (input.query as string | undefined) ?? "";
    case "webfetch":
      return (input.url as string | undefined) ?? "";
    case "tree":
      return (input.path as string | undefined) ?? ".";
    case "load_skill":
      return (input.name as string | undefined) ?? "";
    case "ask_user":
      return (input.question as string | undefined) ?? "";
    case "create_plan":
    case "update_plan": {
      const goal = typeof input.goal === "string" ? input.goal : "";
      return goal ? truncate(goal, 60) : "";
    }
    case "list_skills":
      return "";
    default:
      return formatGenericInput(input);
  }
}

/** `run_command · $ pnpm build` — tool name plus its key input info. */
function toolLabel(part: ToolCallPart): string {
  const summary = truncate(formatInputSummary(part.name, parseInputJson(part)), INPUT_SUMMARY_LIMIT);
  return summary ? `${part.name} · ${summary}` : part.name;
}

function isFailedOutput(part: ToolCallPart): boolean {
  return (
    typeof part.output === "object" && part.output !== null && (part.output as { success?: boolean }).success === false
  );
}

/** Single-line error excerpt from a failed tool output. */
function errorExcerpt(part: ToolCallPart): string {
  if (typeof part.output !== "object" || part.output === null) return "";
  const output = part.output as { error?: unknown; stderr?: unknown; stdout?: unknown };
  const raw = [output.error, output.stderr, output.stdout].find((value) => typeof value === "string" && value);
  return raw ? truncate(raw as string, ERROR_EXCERPT_LIMIT) : "";
}

/** Optional result hint (e.g. grep match count) appended after `✓`. */
function resultHint(part: ToolCallPart): string {
  if (part.name === "grep" && typeof part.output === "object" && part.output !== null) {
    const matches = (part.output as { matches?: unknown }).matches;
    // Only when non-empty: oversized outputs may spill matches to a cache file
    // (empty array would be misleading).
    if (Array.isArray(matches) && matches.length > 0) return ` (${matches.length} matches)`;
  }
  return "";
}

/** Compact status line for a tool call (`📎 run_command · $ pnpm build · ✓`). */
export function toolStatusLine(part: ToolCallPart): string {
  const label = toolLabel(part);
  if (part.approval?.approved === false) return `📎 ${label} · ✗ denied`;
  if (part.output !== undefined) {
    if (part.state === "error" || isFailedOutput(part)) {
      const excerpt = errorExcerpt(part);
      return `📎 ${label} · ✗${excerpt ? ` ${excerpt}` : ""}`;
    }
    return `📎 ${label} · ✓${resultHint(part)}`;
  }
  if (part.approval?.needsApproval && part.approval.approved === undefined) {
    return `📎 ${label} · ⏸ awaiting approval`;
  }
  return `📎 ${label} · running`;
}

/** Scan run messages for interactions that need a user answer. */
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
          question: toolLabel(part),
        });
      }
    }
  }
  return pending;
}

/** Render the current run: assistant texts + tool status lines + pending interactions. */
export function renderReply(messages: UIMessage[]): RenderedReply {
  const run = currentRunMessages(messages);
  const pending = scanPendingInteractions(run);

  const lines: string[] = [];
  let textChars = 0;
  let lastThinking = "";
  for (const message of run) {
    for (const part of message.parts) {
      if (part.type === "text") {
        if (part.content.trim().length > 0) {
          lines.push(part.content);
          textChars += part.content.length;
        }
      } else if (isToolCallPart(part)) {
        lines.push(toolStatusLine(part));
      } else if (part.type === "thinking" && part.content) {
        lastThinking = part.content;
      }
    }
  }

  return { text: lines.join("\n\n").trim(), thinking: textChars === 0 ? lastThinking : "", pending };
}

/** Render the final state of a just-answered interaction (button row cleanup). */
export function renderResolved(question: string, outcome: string): string {
  return `${question}\n\n→ ${outcome}`;
}
