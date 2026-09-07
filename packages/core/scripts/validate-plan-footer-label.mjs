/**
 * Validation for plan Footer phase labels.
 *
 * Run: pnpm --filter @my-agent/core run validate:plan-footer-label
 */

import assert from "node:assert/strict";

import { formatPlanModeFooterLabel, todoProgressFromItems } from "../dist/dev.mjs";

assert.equal(formatPlanModeFooterLabel({ phase: "off" }), null);
assert.equal(formatPlanModeFooterLabel({ phase: "planning" }), "planning");
assert.equal(formatPlanModeFooterLabel({ phase: "ready" }), "review · /mode execute");
assert.equal(formatPlanModeFooterLabel({ phase: "executing" }), "building");
assert.equal(formatPlanModeFooterLabel({ phase: "executing" }, { completed: 2, total: 5 }), "building 2/5");
assert.equal(formatPlanModeFooterLabel({ phase: "retro" }), "retro");

assert.deepEqual(
  todoProgressFromItems([
    { status: "completed" },
    { status: "pending" },
    { status: "in_progress" },
    { status: "completed" },
  ]),
  { completed: 2, total: 4 }
);

console.log("validate:plan-footer-label OK");
