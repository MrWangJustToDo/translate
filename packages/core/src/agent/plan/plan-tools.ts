import type { PlanModeController } from "./plan-mode-controller.js";
import type { ToolsRecord } from "../tools/runtime/tools-record.js";

/**
 * Mutating tools hidden while planning or ready.
 * `task` stays available — subagents are already read-only (Claude/Cursor-style explore).
 */
export const PLAN_MODE_EXCLUDED_TOOL_NAMES = new Set(["write_file", "edit_file", "delete_file", "kill_command"]);

/** Plan authoring tools — only offered while planning/ready. */
export const PLAN_AUTHORING_TOOL_NAMES = new Set(["create_plan", "update_plan"]);

/** Plan completion — only offered while in retro. */
export const PLAN_COMPLETION_TOOL_NAMES = new Set(["complete_plan"]);

export function isMcpToolName(name: string): boolean {
  return name.startsWith("mcp__");
}

/** Build exclude set for {@link resolveToolsRecord} during planning/ready. */
export function getPlanModeToolExcludeSet(tools: ToolsRecord): Set<string> {
  const exclude = new Set(PLAN_MODE_EXCLUDED_TOOL_NAMES);
  for (const name of Object.keys(tools)) {
    if (isMcpToolName(name)) exclude.add(name);
  }
  return exclude;
}

export function isPlanModeForbiddenTool(toolName: string): boolean {
  return PLAN_MODE_EXCLUDED_TOOL_NAMES.has(toolName) || isMcpToolName(toolName);
}

/**
 * Defense-in-depth check before tool execution while restricting tools.
 * Returns an error message when the call must be skipped, else null.
 */
export function getPlanModeToolBlockReason(
  planMode: PlanModeController | null | undefined,
  toolName: string,
  args: unknown
): string | null {
  if (!planMode?.isRestrictingTools()) return null;

  if (isPlanModeForbiddenTool(toolName)) {
    return `Plan mode: "${toolName}" is blocked while planning. Use /mode execute after the plan is ready.`;
  }

  if (toolName === "run_command") {
    // run_command itself is NOT blocked here — it goes through the unified
    // needsApproval + command-safety approval rules (read-only auto-approve,
    // write/external paths ask the user y/n). Only background jobs are still
    // blocked while planning (no UI to control an unattended background job).
    if (
      args &&
      typeof args === "object" &&
      "run_in_background" in args &&
      (args as { run_in_background?: boolean }).run_in_background === true
    ) {
      return "Plan mode: background run_command is blocked while planning.";
    }
  }

  return null;
}
