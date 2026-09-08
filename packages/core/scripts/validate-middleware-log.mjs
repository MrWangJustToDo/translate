/**
 * Validates instrumentMiddlewareLog under the timeline contract: hook-call
 * echoes are OFF by default (opt-in via `MY_AGENT_LOG_HOOKS`), return values
 * (sync + async/promise) pass through untouched in both modes, and
 * high-frequency onChunk and nested sandbox hooks are never wrapped.
 *
 * Run: pnpm --filter @my-agent/core run validate:middleware-log
 */

import assert from "node:assert/strict";

import { instrumentMiddlewareLog } from "../dist/dev.mjs";
import { createLogCapture, sleep } from "./helpers/log-capture.mjs";

// A realistic ChatMiddleware-shaped object (plain object, like the create*
// factories return).
const calls = [];
const middleware = [
  {
    name: "test-middleware",
    onConfig: (ctx, config) => {
      calls.push({ hook: "onConfig", phase: ctx.phase, iteration: ctx.iteration });
      return { messages: [...config.messages, "transformed"] };
    },
    onStart: (ctx) => {
      calls.push({ hook: "onStart", phase: ctx.phase, iteration: ctx.iteration });
    },
    // High-frequency hooks that must NOT be logged or wrapped.
    onChunk: () => {
      calls.push({ hook: "onChunk" });
      return "chunk";
    },
    sandbox: {
      onFile: () => {},
    },
  },
  {
    // No name → anonymous fallback.
    onIteration: async (ctx) => {
      calls.push({ hook: "onIteration", phase: ctx.phase, iteration: ctx.iteration });
      return "iter";
    },
  },
];

const ctx = {
  phase: "beforeModel",
  iteration: 2,
};

const capture = await createLogCapture("middleware-log");
const { log, readEntries } = capture;
const wrapped = instrumentMiddlewareLog(middleware, log);

// ----------------------------------------------------------------------------
// 1. Default (MY_AGENT_LOG_HOOKS unset): no hook echoes, returns still pass.
// ----------------------------------------------------------------------------
delete process.env.MY_AGENT_LOG_HOOKS;

const configOut = wrapped[0].onConfig(ctx, { messages: ["a"] });
assert.deepEqual(configOut, { messages: ["a", "transformed"] }, "onConfig return passes through");
assert.deepEqual(calls[0], { hook: "onConfig", phase: "beforeModel", iteration: 2 });

const startOut = wrapped[0].onStart(ctx);
assert.equal(startOut, undefined, "onStart void return passes through");

const iterOut = await wrapped[1].onIteration(ctx);
assert.equal(iterOut, "iter", "async hook return passes through");

assert.equal(wrapped[0].onChunk(ctx), "chunk", "onChunk untouched");
assert.equal(typeof wrapped[0].sandbox.onFile, "function", "sandbox untouched");
assert.equal(wrapped[0].onChunk === middleware[0].onChunk, true, "onChunk identity preserved (not wrapped)");

await sleep(60);
const defaultEntries = await readEntries();
assert.equal(defaultEntries.length, 0, `no hook echoes by default, got ${JSON.stringify(defaultEntries)}`);
console.log("hook echoes off by default, passthrough intact: OK");

// ----------------------------------------------------------------------------
// 2. Opt-in (MY_AGENT_LOG_HOOKS=1): hooks logged with category/level/phase/iteration.
// ----------------------------------------------------------------------------
process.env.MY_AGENT_LOG_HOOKS = "1";

wrapped[0].onConfig(ctx, { messages: ["a"] });
await wrapped[1].onIteration(ctx);
await sleep(60);

const entries = await readEntries();
assert.ok(entries.length >= 2, `expected >=2 hook entries, got ${entries.length}`);
for (const entry of entries) {
  assert.equal(entry.category, "hooks", `category hooks, got ${entry.category}`);
  assert.equal(entry.level, "debug", `level debug, got ${entry.level}`);
}

assert.ok(
  entries.some((e) => e.message === "middleware:test-middleware:onConfig"),
  `has test-middleware:onConfig entry, got ${entries.map((e) => e.message).join(", ")}`
);
assert.ok(
  entries.some((e) => e.message === "middleware:anonymous:onIteration"),
  `has anonymous:onIteration entry, got ${entries.map((e) => e.message).join(", ")}`
);

const onConfigEntry = entries.find((e) => e.message === "middleware:test-middleware:onConfig");
assert.deepEqual(onConfigEntry.data, { phase: "beforeModel", iteration: 2 }, "phase+iteration in data");

console.log("opt-in hooks logged with phase+iteration: OK");
console.log("middleware-log validation passed");
