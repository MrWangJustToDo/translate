/**
 * Validates Event→Log bridge policy and routing under the timeline contract:
 * bridged entries land in the JSONL sink, large payloads are summarized to
 * size + preview (never inlined), memory debug streams are silent, and
 * approval resolution events are bridged.
 *
 * Run: pnpm --filter @my-agent/core run validate:event-log-bridge
 */

import assert from "node:assert/strict";

import { AgentTelemetryBus, bridgeTelemetryToAgentLog } from "../dist/dev.mjs";
import { createLogCapture, sleep } from "./helpers/log-capture.mjs";

const capture = await createLogCapture("event-log-bridge");
const { log, readEntries } = capture;
const bus = new AgentTelemetryBus();

bridgeTelemetryToAgentLog(bus, () => log);

async function emitAndRead(event) {
  bus.emit(event);
  await sleep(60);
  return readEntries();
}

let entries = await emitAndRead({
  type: "session:doc",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { message: "Loaded instructions from AGENTS.md (1.0 KB)" },
});
const docEntry = entries.find((entry) => entry.category === "system");
assert.ok(docEntry);
assert.match(docEntry.message, /AGENTS\.md/);

entries = await emitAndRead({
  type: "agent:tool-start",
  ts: Date.now(),
  agentId: "agent-1",
  payload: {
    tool_name: "read_file",
    tool_call_id: "tc-1",
    // Large payload must be summarized, not inlined.
    tool_input: { path: "big.txt", content: "x".repeat(5000) },
    eventType: "ignored",
  },
});
const toolEntry = entries.find((entry) => entry.category === "tool");
assert.ok(toolEntry);
assert.match(toolEntry.message, /read_file/);
assert.ok(toolEntry.data.inputBytes >= 5000, `inputBytes recorded, got ${JSON.stringify(toolEntry.data)}`);
assert.ok(toolEntry.data.inputPreview.length <= 200, "preview is truncated to 200 chars");
assert.equal(toolEntry.data.tool_input, undefined, "tool_input never inlined");
assert.equal(toolEntry.data.eventType, undefined, "redundant eventType dropped");

// memory:prefetch success/empty outcomes are silent (only errors log).
entries = await emitAndRead({
  type: "memory:prefetch",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { status: "injected", count: 2, filenames: ["a.md", "b.md"] },
});
assert.ok(
  !entries.some((entry) => entry.category === "memory" && entry.level === "debug"),
  "memory prefetch success must be silent"
);

entries = await emitAndRead({
  type: "subagent:completed",
  ts: Date.now(),
  agentId: "sub-1",
  parentId: "agent-1",
  payload: { subagentId: "sub-1", summary: "Found the test framework", iterations: 3, durationMs: 12000 },
});
const subagentEntry = entries.find((entry) => entry.message.includes("Subagent completed"));
assert.ok(subagentEntry);
assert.match(subagentEntry.message, /Found the test framework/);
assert.ok(!subagentEntry.message.includes("(no summary)"));
assert.equal(subagentEntry.data.iterations, 3, "subagent iterations carried in data");
assert.equal(subagentEntry.data.durationMs, 12000, "subagent durationMs carried in data");

entries = await emitAndRead({
  type: "agent:tool-approval-request",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { tool_name: "run_command", tool_call_id: "tc-1", approval_id: "ap-1" },
});
const approvalRequestEntry = entries.find((entry) => entry.message.startsWith("Approval requested"));
assert.ok(approvalRequestEntry);
assert.match(approvalRequestEntry.message, /run_command/);

entries = await emitAndRead({
  type: "agent:tool-approval-resolved",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { tool_name: "run_command", tool_call_id: "tc-1", decision: "denied", reason: "unsafe rm -rf" },
});
const approvalResolvedEntry = entries.find((entry) => entry.message.startsWith("Approval resolved"));
assert.ok(approvalResolvedEntry, "approval-resolved event is bridged");
assert.match(approvalResolvedEntry.message, /run_command/);
assert.match(approvalResolvedEntry.message, /denied/);
assert.equal(approvalResolvedEntry.data.decision, "denied");

entries = await emitAndRead({
  type: "compaction:reactive-complete",
  ts: Date.now(),
  agentId: "agent-1",
  payload: { originalCount: 40, compactedCount: 12, tokensBefore: 9000, tokensAfter: 2100 },
});
const reactiveEntry = entries.find((entry) => entry.message.includes("Reactive compact:"));
assert.ok(reactiveEntry);
assert.match(reactiveEntry.message, /40→12 messages/);
assert.match(reactiveEntry.message, /9000→2100 tokens/);
assert.ok(!reactiveEntry.message.includes("?→?"));

console.log("bridged entries persisted to JSONL sink: OK");
console.log("payload summarization (bytes+preview, no eventType): OK");
console.log("memory debug streams silent: OK");
console.log("approval request + resolution bridged: OK");
console.log("event-log-bridge validation passed");
