/**
 * Validates turn-level finalize is idempotent and clears continuation marks.
 *
 * Run: pnpm --filter @my-agent/core run validate:run-finalize
 */

import assert from "node:assert/strict";

import { finalizeManagedAgentRun } from "../dist/dev.mjs";

function createHost() {
  // setCurrentRunId / setRun are part of the RunLifecycleHost contract (run scoping).
  const setCurrentRunIdCalls = [];
  let turnLifecycleFinalized = false;
  let prepareAsContinuation = true;
  let clearTurnContextCalls = 0;
  let stopEvents = 0;
  let persistCalls = 0;
  let extractCalls = 0;

  const host = {
    id: "agent-1",
    context: {},
    memory: {
      runExtraction: () => {
        extractCalls += 1;
      },
    },
    log: null,
    setCurrentRunId(runId) {
      setCurrentRunIdCalls.push(runId);
    },
    beginTurnFinalize() {
      if (turnLifecycleFinalized) return false;
      turnLifecycleFinalized = true;
      return true;
    },
    resetTurnLifecycle() {
      turnLifecycleFinalized = false;
    },
    clearPrepareAsContinuation() {
      prepareAsContinuation = false;
    },
    recordStreamDuration() {},
    persistSession() {
      persistCalls += 1;
    },
    clearTurnContext() {
      clearTurnContextCalls += 1;
    },
    emitEvent(type) {
      if (type === "agent:stop") stopEvents += 1;
    },
    getContinuation() {
      return prepareAsContinuation;
    },
    stats() {
      return { clearTurnContextCalls, stopEvents, persistCalls, extractCalls, prepareAsContinuation };
    },
  };

  return host;
}

const host = createHost();
finalizeManagedAgentRun(host, {}, "finished");
finalizeManagedAgentRun(host, {}, "finished");
let stats = host.stats();
assert.equal(stats.clearTurnContextCalls, 1);
assert.equal(stats.stopEvents, 1);
assert.equal(stats.persistCalls, 1);
assert.equal(stats.extractCalls, 1);
assert.equal(stats.prepareAsContinuation, false);

host.resetTurnLifecycle();
finalizeManagedAgentRun(host, {}, "aborted");
stats = host.stats();
assert.equal(stats.clearTurnContextCalls, 2);
assert.equal(stats.stopEvents, 2);
assert.equal(stats.extractCalls, 1);

console.log("run-finalize validation passed");
