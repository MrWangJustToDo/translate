/**
 * Validates typed Emitter + domain migrations (todos / usage / log).
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-emitter
 */
import assert from "node:assert/strict";

import { AgentLog, Emitter, TodoManager, UsageTracker } from "../dist/dev.mjs";

// --- primitive ---
const emitter = new Emitter();
const seen = [];
const unsub = emitter.on("ping", (payload) => {
  seen.push(payload);
});
emitter.emit("ping", { n: 1 });
emitter.emit("ping", { n: 2 });
unsub();
emitter.emit("ping", { n: 3 });
assert.deepEqual(seen, [{ n: 1 }, { n: 2 }]);
assert.equal(emitter.listenerCount("ping"), 0);

// --- TodoManager ---
const todos = new TodoManager();
/** @type {unknown[]} */
const todoPayloads = [];
const unsubTodos = todos.on("change", (items) => {
  todoPayloads.push(items);
});
todos.update([{ content: "a", status: "pending", priority: "medium" }], "t1");
assert.equal(todoPayloads.length, 1);
assert.equal(todoPayloads[0][0].content, "a");
unsubTodos();
todos.update([{ content: "b", status: "pending", priority: "medium" }], "t2");
assert.equal(todoPayloads.length, 1);

// --- UsageTracker ---
const usage = new UsageTracker();
/** @type {unknown[]} */
const usagePayloads = [];
const unsubUsage = usage.on("change", (snap) => {
  usagePayloads.push(snap);
});
usage.updateWindowUsage({
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
});
assert.equal(usagePayloads.length, 1);
assert.equal(usagePayloads[0].total.inputTokens, 10);
assert.equal(usagePayloads[0].total.outputTokens, 5);
assert.equal(usagePayloads[0].window.inputTokens, 10);
unsubUsage();
usage.addTotal({ inputTokens: 1, outputTokens: 1, totalTokens: 2 });
assert.equal(usagePayloads.length, 1);

// --- AgentLog (persistence-only: no in-memory emitter, entries go to the sink) ---
import { createLogCapture, sleep } from "./helpers/log-capture.mjs";

const capture = await createLogCapture("agent-emitter");
assert.equal(typeof capture.log.on, "undefined", "AgentLog has no event emitter (persistence-only)");
capture.log.info("system", "hello emitter");
await sleep(60);
const logEntries = await capture.readEntries();
assert.equal(logEntries.length, 1);
assert.equal(logEntries[0].message, "hello emitter");
capture.log.info("system", "after check");
await sleep(60);
assert.equal((await capture.readEntries()).length, 2);

console.log("agent-emitter validation passed");
