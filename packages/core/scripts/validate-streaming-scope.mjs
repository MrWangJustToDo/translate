/**
 * Validates agent-scoped streaming callback isolation through the unified bus.
 *
 * Run: pnpm --filter @my-agent/core run validate:streaming-scope
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

// ============================================================================
// Per-agent scope multicast + sibling isolation
// ============================================================================
{
  const root = createAgentEventBus();
  const busA = root.scope("agent-a");
  const busB = root.scope("agent-b");
  registerStreamingEventBus("agent-a", busA);
  registerStreamingEventBus("agent-b", busB);

  const chunksA = [];
  const chunksB = [];
  busA.on("tool:chunk", (event) => chunksA.push(event.payload.chunk));
  busB.on("tool:chunk", (event) => chunksB.push(event.payload.chunk));

  emitStreamingChunk("call-a", "stdout", "from-a", { agentId: "agent-a" });
  assert.equal(chunksA.length, 1);
  assert.equal(chunksB.length, 0, "sibling scope stays isolated");
  assert.equal(chunksA[0].chunk, "from-a");

  emitStreamingChunk("call-b", "stderr", "from-b", { agentId: "agent-b" });
  assert.equal(chunksA.length, 1);
  assert.equal(chunksB.length, 1);
  assert.equal(chunksB[0].type, "stderr");

  const clearedA = [];
  const clearedB = [];
  busA.on("tool:clear", (event) => clearedA.push(event.payload.toolCallId));
  busB.on("tool:clear", (event) => clearedB.push(event.payload.toolCallId));

  clearStreamingOutput("call-a", { agentId: "agent-a" });
  assert.deepEqual(clearedA, ["call-a"]);
  assert.deepEqual(clearedB, []);

  unregisterStreamingEventBus("agent-a");
  unregisterStreamingEventBus("agent-b");
  resetStreamingCallbacksForTests();
}

// ============================================================================
// Unified bus projection: own-scope receives tool:chunk / tool:clear
// ============================================================================
{
  const root = createAgentEventBus();
  const busA = root.scope("agent-a");
  const busB = root.scope("agent-b");
  registerStreamingEventBus("agent-a", busA);

  const aChunks = [];
  const bChunks = [];
  busA.on("tool:chunk", (event) => aChunks.push(event.payload.chunk.chunk));
  busB.on("tool:chunk", (event) => bChunks.push(event.payload.chunk.chunk));

  emitStreamingChunk("call-x", "stdout", "hello", { agentId: "agent-a" });
  assert.equal(aChunks.length, 1, "own-scope bus receives tool:chunk");
  assert.equal(aChunks[0], "hello");
  assert.equal(bChunks.length, 0, "sibling scope stays isolated");

  const aClears = [];
  busA.on("tool:clear", (event) => aClears.push(event.payload.toolCallId));
  clearStreamingOutput("call-x", { agentId: "agent-a" });
  assert.deepEqual(aClears, ["call-x"], "tool:clear projects to the scoped bus");

  unregisterStreamingEventBus("agent-a");
  resetStreamingCallbacksForTests();
}

console.log("streaming-scope validation passed");
