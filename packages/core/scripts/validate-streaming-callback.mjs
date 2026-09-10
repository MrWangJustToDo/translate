/**
 * Validates streaming tool output routing through the unified bus
 * (`tool:chunk` / `tool:clear` observer events, agent-scoped).
 *
 * Run: pnpm --filter @my-agent/core run validate:streaming-callback
 */

import assert from "node:assert/strict";

import {
  clearStreamingOutput,
  createAgentEventBus,
  emitStreamingChunk,
  registerStreamingEventBus,
  resetStreamingCallbacksForTests,
  unregisterStreamingEventBus,
} from "../dist/dev.mjs";

resetStreamingCallbacksForTests();

const bus = createAgentEventBus();
registerStreamingEventBus("agent-a", bus);

/** @type {import("../dist/dev.mjs").StreamingChunk[]} */
const chunks = [];
const cleared = [];
const unsubChunk = bus.on("tool:chunk", (event) => chunks.push(event.payload.chunk));
const unsubClear = bus.on("tool:clear", (event) => cleared.push(event.payload.toolCallId));

emitStreamingChunk("call-1", "stdout", "hello", { agentId: "agent-a" });
assert.equal(chunks.length, 1);
assert.equal(chunks[0].chunk, "hello");
assert.equal(chunks[0].toolCallId, "call-1");

emitStreamingChunk("call-1", "stderr", "warn", { agentId: "agent-a" });
assert.equal(chunks.length, 2);
assert.equal(chunks[1].type, "stderr");

// Other agent scope must not receive (no bus registered for agent-b).
emitStreamingChunk("call-1", "stdout", "nope", { agentId: "agent-b" });
assert.equal(chunks.length, 2);

clearStreamingOutput("call-2", { agentId: "agent-a" });
assert.deepEqual(cleared, ["call-2"]);

unsubChunk();
unsubClear();
emitStreamingChunk("call-1", "stdout", "after-unsub", { agentId: "agent-a" });
assert.equal(chunks.length, 2, "unsubscribed bus handler must not receive events");

unregisterStreamingEventBus("agent-a");
emitStreamingChunk("call-1", "stdout", "no-bus", { agentId: "agent-a" });
assert.equal(chunks.length, 2, "unregistered agent must not receive events");

resetStreamingCallbacksForTests();

console.log("streaming-callback validation passed");
