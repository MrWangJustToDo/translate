/**
 * Validates AgentSession command/channel discriminants round-trip JSON.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-session-types
 */
import assert from "node:assert/strict";

import { AGENT_EVENT_META, AGENT_SESSION_CHANNELS, DEFAULT_AGENT_SESSION_CHANNELS } from "../dist/dev.mjs";

assert.ok(AGENT_SESSION_CHANNELS.includes("state"));
assert.ok(AGENT_SESSION_CHANNELS.includes("tool"));
assert.ok(AGENT_SESSION_CHANNELS.includes("summary"));
assert.ok(!AGENT_SESSION_CHANNELS.includes("log"), "log channel removed (persistence-only agent log)");
assert.ok(DEFAULT_AGENT_SESSION_CHANNELS.includes("lifecycle"));
assert.ok(DEFAULT_AGENT_SESSION_CHANNELS.includes("tool"));
assert.ok(DEFAULT_AGENT_SESSION_CHANNELS.includes("summary"));

const commands = [
  { type: "send", content: "hi" },
  { type: "steer", content: "fix" },
  { type: "followUp", content: "later" },
  { type: "stop" },
  { type: "clear" },
  { type: "respondApproval", approvalId: "a1", approved: true, reason: "ok" },
  { type: "addToolResult", toolCallId: "t1", output: { done: true } },
  { type: "setClientToolWaiting", active: true },
  { type: "compact" },
  { type: "rename", name: "x" },
  { type: "auto.set", enabled: true },
  { type: "plan.enable" },
  { type: "plan.disable" },
  { type: "plan.toggle" },
  { type: "plan.execute", sendSteer: true },
  { type: "plan.cancel" },
  { type: "session.resume", sessionId: "s1" },
];

for (const command of commands) {
  const round = JSON.parse(JSON.stringify(command));
  assert.deepEqual(round, command);
}

const event = {
  channel: "usage",
  payload: {
    total: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    window: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    percent: 10,
    tokenLimit: 100,
    cost: 0,
  },
  ts: 1,
};
assert.deepEqual(JSON.parse(JSON.stringify(event)), event);

// The lifecycle channel is now derived from AGENT_EVENT_META (replacing the
// former DEFAULT_SESSION_LIFECYCLE_EVENTS include-list).
const lifecycleEvents = Object.entries(AGENT_EVENT_META)
  .filter(([, meta]) => meta.channel === "lifecycle")
  .map(([type]) => type);
assert.ok(lifecycleEvents.includes("agent:stop"));
assert.ok(!lifecycleEvents.includes("plan:enter"));
assert.ok(!lifecycleEvents.includes("subagent:ui-update"));

console.log("agent-session-types validation passed");
