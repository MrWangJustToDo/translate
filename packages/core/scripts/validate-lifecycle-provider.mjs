/**
 * Validates lifecycle-middleware provider attribution on the timeline entries:
 * llm:request / llm:response carry a provider — extracted from AG-UI
 * SpecTokenUsage[] when present (future-proof), otherwise falling back to the
 * `provider/model` model-id prefix ("deepseek/deepseek-v4-flash-0731" →
 * "deepseek"). Guards the regression where the runtime pipeline never surfaces
 * a provider (openai-base adapters map token fields only; rebuildTokenUsage
 * folds arrays before onUsage).
 *
 * Run: pnpm --filter @my-agent/core run validate:lifecycle-provider
 */

import assert from "node:assert/strict";

import { createLifecycleMiddleware } from "../dist/dev.mjs";

function createHarness() {
  const events = [];
  const middleware = createLifecycleMiddleware({
    usage: {
      updateWindowUsage() {},
      addLlmCall() {},
      getLastCallReasoningTokens: () => 0,
      getLastCallCostUsd: () => 0.001,
      getWindowUsage: () => ({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }),
    },
    getPricing: () => null,
    emitEvent: (type, data) => events.push({ type, data }),
  });
  return { middleware, events };
}

const ctx = (model, iteration = 0) => ({
  model,
  iteration,
  messages: [{ id: "m1", role: "user", content: "hi" }],
  toolNames: ["read_file"],
});

// --- Fallback: model-id prefix supplies provider when usage never reports one ---
{
  const { middleware, events } = createHarness();
  await middleware.onStart?.(ctx("deepseek/deepseek-v4-flash-0731"), undefined);
  const req0 = events.find((e) => e.type === "llm:request");
  assert.ok(req0, "llm:request emitted on start");
  assert.equal(req0.data.provider, "deepseek", "first request falls back to model-id prefix");

  // onUsage with single-object usage (no provider) keeps the fallback sticky.
  await middleware.onUsage?.(ctx("deepseek/deepseek-v4-flash-0731"), {
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  });
  await middleware.onFinish?.(ctx("deepseek/deepseek-v4-flash-0731"), {
    finishReason: "stop",
    duration: 12,
    content: "done",
  });
  const res = events.find((e) => e.type === "llm:response");
  assert.ok(res, "llm:response emitted on finish");
  assert.equal(res.data.provider, "deepseek", "llm:response carries sticky provider");
}

// --- Future-proof: AG-UI SpecTokenUsage[] provider wins over the model prefix ---
{
  const { middleware, events } = createHarness();
  await middleware.onUsage?.(ctx("deepseek/deepseek-v4-flash-0731"), [
    { provider: "zhipu", model: "glm-5.3-flash", inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  ]);
  await middleware.onStart?.(ctx("deepseek/deepseek-v4-flash-0731", 1), undefined);
  const req = events.find((e) => e.type === "llm:request");
  assert.equal(req.data.provider, "zhipu", "usage-provided provider wins over model prefix");
  await middleware.onFinish?.(ctx("deepseek/deepseek-v4-flash-0731", 1), {
    finishReason: "stop",
    duration: 8,
    content: "ok",
  });
  const res = events.find((e) => e.type === "llm:response");
  assert.equal(res.data.provider, "zhipu", "llm:response carries usage-provided provider");
}

// --- Bare model id (no `/`): provider stays undefined ---
{
  const { middleware, events } = createHarness();
  await middleware.onStart?.(ctx("gpt-4o"), undefined);
  const req = events.find((e) => e.type === "llm:request");
  assert.equal(req.data.provider, undefined, "bare model id yields no provider");
}

console.log("lifecycle-provider validation passed");
