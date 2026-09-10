/**
 * Validates SummaryStreamHub + line-buffer / display-window helpers.
 *
 * Run: pnpm --filter @my-agent/core run validate:summary-stream
 */

import assert from "node:assert/strict";

import {
  SummaryStreamHub,
  applyAppendToDisplayWindow,
  applySummaryStreamAppend,
  compactSummaryStreamId,
  createAgentEventBus,
  displayWindowFromSnapshot,
  emptySummaryDisplayWindow,
  emptySummaryLineBuffer,
  renderSummaryDisplayRows,
  summaryStreamKey,
} from "../dist/dev.mjs";

// --- line buffer ---
{
  let buf = emptySummaryLineBuffer();
  buf = applySummaryStreamAppend(buf, "hello");
  assert.deepEqual(buf, { lines: [], pendingLine: "hello" });
  buf = applySummaryStreamAppend(buf, "\nworld\n");
  assert.deepEqual(buf, { lines: ["hello", "world"], pendingLine: "" });
  buf = applySummaryStreamAppend(buf, "tail", { maxCompleteLines: 1 });
  assert.deepEqual(buf, { lines: ["world"], pendingLine: "tail" });
}

// --- display window ---
{
  let win = emptySummaryDisplayWindow();
  win = applyAppendToDisplayWindow(win, "a\nb\nc\nd\n", 2);
  assert.deepEqual(win.lines, ["c", "d"]);
  assert.equal(win.hidden, 2);
  assert.equal(win.pendingLine, "");

  const rendered = renderSummaryDisplayRows(win, 3);
  assert.equal(rendered.hidden, 2);
  assert.equal(rendered.rows[0], "… 2 lines hidden above");
  assert.deepEqual(rendered.rows.slice(1), ["c", "d"]);

  const fromSnap = displayWindowFromSnapshot({ lines: ["a", "b", "c", "d"], pendingLine: "e" }, 2);
  assert.deepEqual(fromSnap.lines, ["c", "d"]);
  assert.equal(fromSnap.pendingLine, "e");
  assert.equal(fromSnap.hidden, 2);
}

// --- hub events + snapshot ---
{
  const hub = new SummaryStreamHub();
  const bus = createAgentEventBus();
  hub.setEventBus(bus);
  /** @type {import("../dist/dev.mjs").SummaryStreamEvent[]} */
  const events = [];
  const unsub = bus.on("session:summary", (event) => events.push(event.payload));

  const key = summaryStreamKey("task", "tc-1");
  hub.reset({ source: "task", toolCallId: "tc-1" });
  hub.append(key, "line1\nline2");
  hub.end(key);

  assert.equal(events[0]?.type, "reset");
  assert.equal(events[1]?.type, "append");
  assert.equal(events[2]?.type, "end");

  const snap = hub.getSnapshot(key);
  assert.ok(snap);
  assert.equal(snap.status, "ended");
  assert.deepEqual(snap.lines, ["line1"]);
  assert.equal(snap.pendingLine, "line2");
  assert.ok(snap.seq >= 3);

  // Late append after end is ignored.
  hub.append(key, "\nignored");
  assert.equal(hub.getSnapshot(key)?.pendingLine, "line2");

  // Compact key is stable (agent-scoped singleton).
  assert.equal(compactSummaryStreamId("agent_root"), "agent_root");
  hub.reset({ source: "compact", compactId: compactSummaryStreamId("agent_root") });
  const compactKey = summaryStreamKey("compact", compactSummaryStreamId("agent_root"));
  hub.append(compactKey, "compact text");
  assert.equal(hub.getSnapshot(compactKey)?.pendingLine, "compact text");
  assert.equal(hub.listSnapshots().length, 2);

  // Second compact reset reuses the same key (no zombie entries).
  hub.reset({ source: "compact", compactId: compactSummaryStreamId("agent_root") });
  assert.equal(hub.listSnapshots().filter((s) => s.source === "compact").length, 1);
  assert.equal(hub.getSnapshot(compactKey)?.status, "active");
  assert.equal(hub.getSnapshot(compactKey)?.pendingLine, "");

  unsub();
}

console.log("summary-stream validation passed");
