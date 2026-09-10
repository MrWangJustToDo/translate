/**
 * Validation for plan-mode session restore + approval auto-approve gating.
 *
 * Run: pnpm --filter @my-agent/core run validate:plan-session
 */

import assert from "node:assert/strict";

import { PLAN_TODO_TITLE, PlanModeController, TodoManager, createAgentEventBus } from "../dist/dev.mjs";

const events = [];
const todoManager = new TodoManager();
const controller = new PlanModeController({
  emitEvent: (type, data) => events.push({ type, data }),
  getTodoManager: () => todoManager,
});
const bus = createAgentEventBus();
todoManager.setEventBus(bus);
controller.setEventBus(bus);

assert.equal(controller.shouldAutoApproveTools(), false);

controller.enable();
assert.equal(controller.shouldAutoApproveTools(), false);

await controller.applyStructuredPlan({
  goal: "Session restore demo",
  steps: ["Explore", "Implement", "Verify"],
  keyFiles: ["src/index.ts"],
});
assert.equal(controller.getPhase(), "ready");
assert.equal(controller.shouldAutoApproveTools(), false);

const began = controller.beginExecution();
assert.equal(began.ok, true);
assert.equal(controller.getPhase(), "executing");
assert.equal(controller.shouldAutoApproveTools(), true);
assert.equal(todoManager.isPlanBound(), true);
assert.equal(todoManager.isAutoClearEnabled(), false);

// Simulate persist → restore on a fresh controller (todos restored separately).
const snapshot = controller.getState();
const todos = todoManager.getItems();
const title = todoManager.getTitle();
const planBound = todoManager.isPlanBound();

const restoredTodos = new TodoManager();
restoredTodos.restoreTodos(todos, { title, planBound });
restoredTodos.setAutoClearEnabled(true); // would be dangerous without plan restore

const restored = new PlanModeController({
  emitEvent: (type, data) => events.push({ type, data }),
  getTodoManager: () => restoredTodos,
});
const restoredBus = createAgentEventBus();
restoredTodos.setEventBus(restoredBus);
restored.setEventBus(restoredBus);
assert.equal(restored.shouldAutoApproveTools(), false);

restored.restoreState(snapshot);
assert.equal(restored.getPhase(), "executing");
assert.equal(restored.shouldAutoApproveTools(), true);
assert.equal(restoredTodos.isPlanBound(), true);
assert.equal(restoredTodos.isAutoClearEnabled(), false);
assert.equal(restoredTodos.getTitle(), PLAN_TODO_TITLE);

// Completing all todos after restore should still enter retro.
restoredTodos.update(
  restoredTodos.getItems().map((item) => ({
    content: item.content,
    status: "completed",
    priority: item.priority,
  })),
  PLAN_TODO_TITLE
);
assert.equal(restored.getPhase(), "retro");
assert.equal(restored.shouldAutoApproveTools(), false);

// Off snapshot clears phase without wiping unrelated todos.
const otherTodos = new TodoManager();
otherTodos.update([{ content: "Keep me", status: "pending", priority: "medium" }], "Other");
const clearCtrl = new PlanModeController({
  emitEvent: () => {},
  getTodoManager: () => otherTodos,
});
clearCtrl.restoreState(null);
assert.equal(clearCtrl.getPhase(), "off");
assert.equal(otherTodos.getItems().length, 1);

// Stuck executing without seeded todos must not auto-approve.
const stuck = new PlanModeController({
  emitEvent: () => {},
  getTodoManager: () => new TodoManager(),
});
stuck.restoreState({
  phase: "executing",
  planMarkdown: "## Plan\n1. x",
  steps: [{ step: 1, text: "x" }],
  enabledAt: Date.now(),
  todosSeeded: false,
  preservedExistingTodos: false,
  planFilePath: null,
});
assert.equal(stuck.getPhase(), "executing");
assert.equal(stuck.shouldAutoApproveTools(), false);

console.log("validate:plan-session OK");
