/**
 * Validates RunCoordinator abort wiring and pending abort, plus the
 * CompactionService reactive-compact retry budget.
 *
 * Run: pnpm --filter @my-agent/core run validate:run-coordinator
 */
/* eslint-disable no-undef */
import assert from "node:assert/strict";

import { AgentRunner, RunCoordinator, CompactionService } from "../dist/dev.mjs";

const coordinator = new RunCoordinator();

assert.equal(coordinator.isAbortError(new DOMException("aborted", "AbortError")), true);
assert.equal(coordinator.isAbortError(new Error("network timeout")), false);

// Reactive-compact retry budget (CompactionService)
const compaction = new CompactionService();
assert.equal(compaction.canRetryReactiveCompact(), true);
assert.equal(compaction.recordReactiveCompactRetry(), 1);
compaction.resetReactiveCompactRetries();
assert.equal(compaction.canRetryReactiveCompact(), true);
assert.equal(compaction.getMaxReactiveCompactRetries() > 0, true);

{
  let status = "running";
  coordinator.setupAbortController(undefined, {
    onAborted: () => {
      status = "aborted";
    },
  });
  const pending = new AbortController();
  coordinator.addPendingAbortController(pending);
  const runController = coordinator.currentAbortController;
  assert.ok(runController);

  // AgentRunner must reuse the RunCoordinator controller identity (main/subagent abort path).
  const chatController = AgentRunner.resolveAbortController({ abortController: runController });
  assert.equal(chatController, runController);

  coordinator.abort("user-cancelled");
  assert.equal(status, "aborted");
  assert.equal(runController.signal.aborted, true);
  assert.equal(pending.signal.aborted, true);
}

console.log("run-coordinator validation passed");
