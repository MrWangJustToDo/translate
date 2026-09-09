/**
 * Validates token-budget keep policy: cut-point selection, pairing-safe
 * boundaries, split-turn detection, wire projection consistency, and the
 * legacy turn-count fallback.
 *
 * Requires a prior package build (`pnpm run build`) so imports resolve from `dist/dev.mjs`.
 *
 * Run: pnpm --filter @my-agent/core run validate:compaction-keep-policy
 */

import { convertMessagesToModelMessages } from "@tanstack/ai";
import assert from "node:assert/strict";

import {
  createCompactionConfig,
  deriveKeepRecentTokens,
  findCutPoint,
  findCutPointByBudget,
  getModelVisibleMessages,
  keepPolicyProjectionOptions,
  resolveAutoCompactTrigger,
  resolveKeepPolicy,
  createCompactionSummaryUIMessage,
} from "../dist/dev.mjs";

// ============================================================================
// Helpers — build TanStack model messages with realistic sizes
// ============================================================================

let seq = 0;
const text = (t) => ({ type: "text", content: t });
const user = (t) => ({ role: "user", id: `u${seq++}`, content: t });
const assistant = (t, toolCalls) => ({
  role: "assistant",
  id: `a${seq++}`,
  content: [text(t)],
  ...(toolCalls ? { toolCalls } : {}),
});
const toolMsg = (id, output) => ({
  role: "tool",
  toolCallId: id,
  content: [{ type: "text", content: `result:${output}` }],
});
const toolCall = (id, name = "run_command") => ({
  id,
  type: "function",
  function: { name, arguments: "{}" },
});

/** Rough token estimate mirroring chars/4 for assertions. */
const tokensOf = (messages) =>
  messages.reduce((acc, m) => {
    const parts = typeof m.content === "string" ? [text(m.content)] : (m.content ?? []);
    const chars =
      (parts ?? []).reduce((n, p) => n + (p?.type === "text" ? p.content.length : 0), 0) +
      (m.toolCalls ?? []).reduce((n, tc) => n + tc.function.arguments.length + tc.function.name.length, 0);
    return acc + Math.ceil(chars / 4);
  }, 0);

// ============================================================================
// resolveKeepPolicy
// ============================================================================

// Explicit budget wins.
assert.deepEqual(resolveKeepPolicy({ keepRecentTokens: 10_000 }, 200_000), {
  kind: "tokens",
  keepRecentTokens: 10_000,
});

// Derived from context window when unset.
{
  const policy = resolveKeepPolicy({}, 128_000);
  assert.equal(policy.kind, "tokens");
  // min((128k - 16.4k) * 0.25, 32k) ≈ 27.9k
  assert.equal(policy.keepRecentTokens, deriveKeepRecentTokens(128_000));
  assert.ok(policy.keepRecentTokens > 20_000 && policy.keepRecentTokens <= 32_000);
}

// Small windows clamp to a usable minimum.
assert.ok(deriveKeepRecentTokens(8_000) >= 4_000);

// Legacy fallback without a context window.
assert.deepEqual(resolveKeepPolicy({ keepRecentFlows: 3 }), { kind: "turns", keepRecentFlows: 3 });
assert.deepEqual(resolveKeepPolicy({}), { kind: "turns", keepRecentFlows: 2 });

// Projection options payload.
assert.deepEqual(keepPolicyProjectionOptions({ kind: "tokens", keepRecentTokens: 5_000 }), {
  keepRecentTokens: 5_000,
});
assert.deepEqual(keepPolicyProjectionOptions({ kind: "turns", keepRecentFlows: 2 }), { keepRecentFlows: 2 });

// ============================================================================
// Trigger base — working budget (tokenThreshold), clamped to the real window
// ============================================================================

// Threshold-first: the trigger shares the UI percentage base. A huge real
// window (e.g. models.dev reports 1M) must NOT defer compaction past the
// auto-filled working budget (min(window, MAX_THRESHOLD)=200k → 80% = 160k).
assert.deepEqual(resolveAutoCompactTrigger({ tokenThreshold: 200_000, compactAtPercent: 80 }, 1_000_000), {
  triggerAt: 160_000,
});
// Oversized threshold is clamped to the real window so compaction can still fire.
assert.deepEqual(resolveAutoCompactTrigger({ tokenThreshold: 500_000, compactAtPercent: 80 }, 128_000), {
  triggerAt: Math.floor((128_000 * 80) / 100),
});
// Small window below the threshold: same clamp, 80% of the window.
assert.deepEqual(resolveAutoCompactTrigger({ compactAtPercent: 80 }, 32_000), {
  triggerAt: Math.floor((32_000 * 80) / 100),
});
// No window info: pure absolute path.
{
  const r = resolveAutoCompactTrigger({ tokenThreshold: 100_000, compactAtPercent: 50 });
  assert.equal(r.triggerAt, 50_000);
}

// ============================================================================
// Budget walk: single oversized turn still yields a cut (the core bug fix)
// ============================================================================

{
  const big = "x".repeat(40_000); // ~10k tokens per message
  // One turn: user + many assistant/tool exchanges. No second user turn exists.
  const messages = [
    user("please refactor everything"),
    ...Array.from({ length: 6 }, (_, i) => [
      assistant(`step ${i}`, [toolCall(`call-${i}`)]),
      toolMsg(`call-${i}`, big),
    ]).flat(),
    assistant("done"),
  ];

  // Legacy count-based policy cannot cut (needs 2 user turns).
  assert.equal(findCutPoint(messages, 2), 0);

  // Token-budget policy cuts inside the turn at an assistant boundary.
  const cut = findCutPointByBudget(messages, 24_000);
  assert.ok(cut.cutIndex > 1, `expected mid-turn cut, got ${cut.cutIndex}`);
  assert.equal(cut.isSplitTurn, true);
  assert.equal(cut.turnStartIndex, 0);

  // Cut boundary is never a tool result and never orphans pairs.
  const cutMessage = messages[cut.cutIndex];
  assert.notEqual(cutMessage.role, "tool");

  // Kept region tokens are bounded (within slack of the budget).
  assert.ok(tokensOf(messages.slice(cut.cutIndex)) <= 24_000 + 11_000);

  // Summarized side is non-empty → compaction makes progress.
  assert.ok(tokensOf(messages.slice(0, cut.cutIndex)) > 0);
}

// ============================================================================
// Pairing safety across random-ish budgets
// ============================================================================

{
  const messages = [];
  let callId = 0;
  for (let turn = 0; turn < 4; turn++) {
    messages.push(user(`task ${turn} — ${"y".repeat(5_000)}`));
    for (let i = 0; i < 3; i++) {
      messages.push(assistant(`working ${i}`, [toolCall(`c${callId}`)]));
      messages.push(toolMsg(`c${callId}`, "z".repeat(8_000)));
      callId++;
    }
    messages.push(assistant(`turn ${turn} complete`));
  }

  for (const budget of [4_000, 12_000, 30_000, 60_000]) {
    const cut = findCutPointByBudget(messages, budget);
    if (cut.cutIndex === 0) continue;
    const kept = messages.slice(cut.cutIndex);
    // Every kept tool result has its call in the kept region.
    const keptCallIds = new Set(kept.flatMap((m) => (m.toolCalls ?? []).map((tc) => tc.id)));
    for (const m of kept) {
      if (m.role === "tool") {
        assert.ok(keptCallIds.has(m.toolCallId), `orphaned tool result at budget ${budget}`);
      }
    }
    // Never cut on a tool message.
    assert.notEqual(kept[0].role, "tool");
  }
}

// ============================================================================
// Wire projection: deterministic recovery with token budget
// ============================================================================

{
  const history = [
    user("old task"),
    assistant("working", [toolCall("old-call")]),
    toolMsg("old-call", "w".repeat(9_000)),
  ];
  const after = [user("new task"), assistant("ok")];
  const summaryUIMessage = createCompactionSummaryUIMessage("SUMMARY BODY\n[END SUMMARY]");
  const chronologic = convertMessagesToModelMessages([...history, summaryUIMessage, ...after]);

  const opts = keepPolicyProjectionOptions(resolveKeepPolicy({ keepRecentTokens: 1_000 }, undefined));
  const wireA = getModelVisibleMessages(chronologic, opts);
  const wireB = getModelVisibleMessages(chronologic, opts);
  assert.deepEqual(wireA, wireB, "projection must be deterministic over frozen input");

  // Summary first, kept slice follows, newer messages last.
  assert.equal(wireA[0].role, "user");
  assert.ok(JSON.stringify(wireA[0]).includes("SUMMARY BODY"));
  assert.equal(wireA[wireA.length - 1].role, "assistant");

  // Token-budget projection keeps less than legacy-2-turns would here.
  const legacyWire = getModelVisibleMessages(chronologic, { keepRecentFlows: 2 });
  assert.ok(wireA.length <= legacyWire.length);
}

// ============================================================================
// Single default source: both createCompactionConfig paths resolve to 80%
// ============================================================================
assert.equal(createCompactionConfig({}).compactAtPercent, 80, "explicit-empty path → schema default 80");
assert.equal(createCompactionConfig().compactAtPercent, 80, "undefined path → schema default 80");
assert.deepEqual(
  {
    tokenThreshold: createCompactionConfig().tokenThreshold,
    keepRecentFlows: createCompactionConfig().keepRecentFlows,
  },
  { tokenThreshold: 100_000, keepRecentFlows: 2 }
);

console.log("compaction-keep-policy validation passed");
