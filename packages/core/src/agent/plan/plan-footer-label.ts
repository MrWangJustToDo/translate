import type { PlanModePhase, PlanModeState } from "./plan-mode-controller.js";

export interface PlanTodoProgress {
  completed: number;
  total: number;
}

/**
 * Footer label for the current plan phase (without auto-approve prefix).
 * Returns null when plan mode is off.
 */
export function formatPlanModeFooterLabel(
  state: Pick<PlanModeState, "phase">,
  progress?: PlanTodoProgress | null
): string | null {
  switch (state.phase as PlanModePhase) {
    case "planning":
      return "planning";
    case "ready":
      return "review · /mode execute";
    case "executing": {
      if (progress && progress.total > 0) {
        return `building ${progress.completed}/${progress.total}`;
      }
      return "building";
    }
    case "retro":
      return "retro";
    case "off":
    default:
      return null;
  }
}

/** Count completed vs total todos for building n/m display. */
export function todoProgressFromItems(items: Array<{ status: string }>): PlanTodoProgress {
  const total = items.length;
  const completed = items.filter((item) => item.status === "completed").length;
  return { completed, total };
}
