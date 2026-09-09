/**
 * Offline validation for @my-agent/im-bridge — mock ChatAdapter + fake
 * AgentSession, no server / no Telegram required.
 *
 * Covers: inbound → dispatch, approval button → respondApproval (buttons ride
 * on the tool call's own message), ask_user button → addToolResult, TTL
 * auto-deny, allowlist rejection, restart recovery (sessions.json →
 * host.connect), code-block-aware splitting, ordered non-streaming segment
 * rendering (text sealed → posted; final answer at finalize).
 *
 * Run after `pnpm build:im-bridge`:
 *   node packages/im-bridge/scripts/validate-bridge.mjs
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createImBridge, parseBridgeConfig, SessionResolver, splitMessage, RunRenderer } =
  await import("../dist/index.mjs");

// ============================================================================
// Fakes
// ============================================================================

function createFakeSession(id) {
  const handlers = new Set();
  const dispatched = [];
  const state = { status: "idle", messages: [] };
  return {
    id,
    dispatched,
    state,
    emit(channel, payload) {
      for (const handler of handlers) handler({ channel, payload, ts: Date.now() });
    },
    getSnapshot() {
      return { status: state.status, messages: state.messages };
    },
    async dispatch(command) {
      dispatched.push(command);
      return { ok: true };
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

function createFakeHost() {
  const sessions = new Map();
  let counter = 0;
  return {
    sessions,
    connectCalls: [],
    async create() {
      const session = createFakeSession(`agent_fake_${++counter}`);
      sessions.set(session.id, session);
      return { session };
    },
    connect(agentId) {
      this.connectCalls.push(agentId);
      return sessions.get(agentId) ?? null;
    },
    list() {
      return [];
    },
    async destroy(agentId) {
      sessions.delete(agentId);
    },
  };
}

function createMockAdapter() {
  let messageHandler = null;
  let buttonHandler = null;
  const sent = [];
  const edits = [];
  /** Unified send/edit chronology — ordering assertions read this. */
  const log = [];
  let counter = 0;
  const adapter = {
    platform: "mock",
    caps: { markdown: false, editMessage: true, buttons: true, maxTextLength: 4096, streaming: "edit" },
    sent,
    edits,
    log,
    async start() {},
    async stop() {},
    onMessage(handler) {
      messageHandler = handler;
    },
    onButton(handler) {
      buttonHandler = handler;
    },
    async sendText(target, text, options) {
      const ref = { messageId: `m${++counter}`, chat: target };
      sent.push({ ref, text, buttons: options?.buttons });
      log.push({ op: "send", messageId: ref.messageId, text, buttons: options?.buttons });
      return ref;
    },
    async sendButtons(target, text, buttons) {
      return adapter.sendText(target, text, { buttons });
    },
    async editMessage(target, messageId, text, options) {
      edits.push({ messageId, text, buttons: options?.buttons });
      log.push({ op: "edit", messageId, text, buttons: options?.buttons });
    },
    async setTyping() {},
    async emitMessage(msg) {
      await messageHandler(msg);
    },
    async emitButton(cb) {
      await buttonHandler(cb);
    },
  };
  return adapter;
}

const CHAT = { chatId: "chat1", chatType: "private" };
const tmpBase = mkdtempSync(join(tmpdir(), "im-bridge-validate-"));

function makeConfig(env = {}) {
  return parseBridgeConfig({
    REMOTE_SESSION: "http://localhost:59999",
    TELEGRAM_BOT_TOKEN: "test-token",
    IM_BRIDGE_APPROVAL_TTL_MS: "120",
    IM_BRIDGE_DATA_DIR: join(tmpBase, env.dirSuffix ?? "default"),
    ...env,
  });
}

async function waitFor(predicate, timeoutMs = 2000, what = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function approvalPart() {
  return {
    type: "tool-call",
    id: "tc1",
    name: "run_command",
    arguments: JSON.stringify({ command: "npm test" }),
    state: "input-complete",
    approval: { id: "ap1", needsApproval: true, approved: undefined },
    output: undefined,
  };
}

function askUserPart() {
  return {
    type: "tool-call",
    id: "tc2",
    name: "ask_user",
    arguments: JSON.stringify({ question: "Pick one", options: ["Alpha", "Beta"] }),
    state: "input-complete",
    output: undefined,
  };
}

async function startBridge(env = {}) {
  const config = makeConfig(env);
  const host = createFakeHost();
  const adapter = createMockAdapter();
  const errors = [];
  const bridge = await createImBridge({
    config,
    adapter,
    host,
    onError: (error) => errors.push(error),
  });
  await bridge.start();
  startedBridges.push(bridge);
  return { config, host, adapter, errors, bridge };
}

/** Stopped after the suite so live cycles' typing/TTL timers don't hang the process. */
const startedBridges = [];

// ============================================================================
// Scenarios
// ============================================================================

async function testInboundDispatch() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "hello agent", raw: null });
  await waitFor(() => host.sessions.size === 1, 2000, "session creation");
  const session = [...host.sessions.values()][0];
  await waitFor(() => session.dispatched.length === 1, 2000, "dispatch");
  assert.equal(session.dispatched[0].type, "send");
  assert.equal(session.dispatched[0].content, "hello agent");
  console.log("✓ inbound message → host.create + dispatch send");
}

async function testApprovalButton() {
  const { adapter, host } = await startBridge({ IM_BRIDGE_APPROVAL_TTL_MS: "5000" });
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "run tests", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  session.state.messages = [{ role: "assistant", parts: [approvalPart()] }];
  session.emit("messages", session.state.messages);
  await waitFor(() => adapter.log.some((entry) => entry.buttons?.length > 0), 2000, "approval message");
  const approvalEntry = adapter.log.find((entry) => entry.buttons?.length > 0);
  // Merged rendering: the buttons ride on the tool call's own message (the
  // first segment claims the ⏳ placeholder via edit, so read the unified log).
  assert.ok(approvalEntry.text.includes("run_command"), "tool line and buttons share one message");
  assert.ok(approvalEntry.text.includes("awaiting approval"), "tool line shows the pending state");
  const buttons = approvalEntry.buttons;
  const approve = buttons.find((button) => button.label === "✅ Approve");
  const deny = buttons.find((button) => button.label === "❌ Deny");
  assert.ok(approve && deny, "approve/deny buttons rendered");

  await adapter.emitButton({
    platform: "mock",
    chat: CHAT,
    messageId: approvalEntry.messageId,
    userId: "u1",
    data: approve.data,
    ack: async () => {},
  });
  await waitFor(
    () => session.dispatched.some((cmd) => cmd.type === "respondApproval"),
    2000,
    "respondApproval dispatch"
  );
  const command = session.dispatched.find((cmd) => cmd.type === "respondApproval");
  assert.equal(command.approvalId, "ap1");
  assert.equal(command.approved, true);
  // Click feedback: buttons drop AND the outcome shows on the same message
  // immediately (before any run event arrives).
  await waitFor(
    () =>
      adapter.edits.some(
        (entry) =>
          entry.messageId === approvalEntry.messageId &&
          entry.buttons === undefined &&
          entry.text.includes("✓ approved")
      ),
    2000,
    "settled row after click"
  );
  // Diagnostics: the click and its settle outcome land in <dataDir>/bridge.log.
  const diagLog = readFileSync(join(tmpBase, "default", "bridge.log"), "utf8");
  assert.ok(diagLog.includes("button click a=y"), "click logged");
  assert.ok(/settle approval .*applied=true/.test(diagLog), "settle outcome logged");
  console.log("✓ approval click → respondApproval(true), row settled in place (✓ approved, buttons dropped)");
}

async function testAskUserButton() {
  const { adapter, host } = await startBridge({ IM_BRIDGE_APPROVAL_TTL_MS: "5000" });
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "ask me", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  session.state.messages = [{ role: "assistant", parts: [askUserPart()] }];
  session.emit("messages", session.state.messages);
  await waitFor(() => adapter.log.some((entry) => entry.buttons?.length > 0), 2000, "ask_user message");
  const askEntry = adapter.log.find((entry) => entry.buttons?.length > 0);
  assert.ok(askEntry.text.includes("ask_user"), "question line and buttons share one message");
  const buttons = askEntry.buttons;
  assert.deepEqual(
    buttons.map((button) => button.label),
    ["Alpha", "Beta"]
  );

  await adapter.emitButton({
    platform: "mock",
    chat: CHAT,
    messageId: askEntry.messageId,
    userId: "u1",
    data: buttons[1].data,
    ack: async () => {},
  });
  await waitFor(() => session.dispatched.some((cmd) => cmd.type === "addToolResult"), 2000, "addToolResult dispatch");
  const command = session.dispatched.find((cmd) => cmd.type === "addToolResult");
  assert.equal(command.toolCallId, "tc2");
  assert.equal(command.output.answer, "Beta");
  assert.equal(command.output.hasOptions, true);
  await waitFor(
    () =>
      adapter.edits.some(
        (entry) =>
          entry.messageId === askEntry.messageId && entry.buttons === undefined && entry.text.includes("▸ Beta")
      ),
    2000,
    "settled row after ask_user answer"
  );
  console.log("✓ ask_user option button → addToolResult(answer), row settled in place (▸ Beta)");
}

async function testOneMessagePerApproval() {
  const { adapter, host } = await startBridge({ IM_BRIDGE_APPROVAL_TTL_MS: "5000" });
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "parallel tools", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  const partA = approvalPart();
  const partB = { ...approvalPart(), id: "tc1b", approval: { id: "ap2", needsApproval: true, approved: undefined } };
  session.state.messages = [{ role: "assistant", parts: [partA, partB] }];
  session.emit("messages", session.state.messages);
  await waitFor(
    () => new Set(adapter.log.filter((entry) => entry.buttons?.length > 0).map((entry) => entry.messageId)).size === 2,
    2000,
    "two approval messages"
  );
  const approvalEntries = [
    ...new Map(
      adapter.log.filter((entry) => entry.buttons?.length > 0).map((entry) => [entry.messageId, entry])
    ).values(),
  ];
  for (const entry of approvalEntries) {
    assert.equal(entry.buttons.length, 2, "one approval = exactly 2 buttons (approve/deny)");
  }
  assert.notEqual(approvalEntries[0].messageId, approvalEntries[1].messageId, "distinct messages");
  console.log("✓ two pending approvals → two dedicated tool messages, one approval each");
}

async function testTtlAutoDeny() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "needs approval", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");
  session.state.messages = [{ role: "assistant", parts: [approvalPart()] }];
  session.emit("messages", session.state.messages);
  await waitFor(
    () => session.dispatched.some((cmd) => cmd.type === "respondApproval" && cmd.approved === false),
    3000,
    "TTL auto-deny"
  );
  const command = session.dispatched.find((cmd) => cmd.type === "respondApproval");
  assert.equal(command.approvalId, "ap1");
  assert.equal(command.approved, false);
  assert.equal(command.reason, "timed out");
  await waitFor(
    () => adapter.edits.some((entry) => entry.buttons === undefined && entry.text.includes("✗ denied (timed out)")),
    2000,
    "settled row after TTL expiry"
  );
  console.log("✓ pending approval TTL expiry → auto-deny + row settled (✗ denied (timed out))");
}

async function testAllowlistRejection() {
  const { adapter, host } = await startBridge({ IM_BRIDGE_ALLOW_USERS: "u1" });
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "intruder", text: "hi", raw: null });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(host.sessions.size, 0, "no session created for rejected user");
  assert.ok(
    adapter.sent.some((entry) => entry.text.includes("Not authorized")),
    "unauthorized notice sent"
  );
  console.log("✓ allowlist rejection → no dispatch, notice sent");
}

async function testSteerWhileRunning() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "first", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => session.dispatched.length === 1, 2000, "first dispatch");
  session.state.status = "running";
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "second", raw: null });
  await waitFor(() => session.dispatched.length === 2, 2000, "second dispatch");
  assert.equal(session.dispatched[1].type, "steer");
  assert.equal(session.dispatched[1].content, "second");
  console.log("✓ message while running → dispatch steer");
}

function textMsg(role, id, text) {
  return { role, id, createdAt: new Date(), parts: [{ type: "text", content: text }] };
}

function toolPart(id, name, input, output) {
  return {
    type: "tool-call",
    id,
    name,
    arguments: JSON.stringify(input),
    state: output === undefined ? "input-complete" : "output-available",
    ...(output !== undefined ? { output } : {}),
  };
}

/**
 * The status flickers `thinking`/`responding`/`running` many times mid-run and
 * pauses at `awaiting_user` for ask_user. Only a finished run (`completed` /
 * `error` / `aborted`) may finalize — finalizing earlier freezes the
 * placeholder and unsubscribes, so the reply only surfaces one message later.
 * Non-streaming additionally means: unsealed text is NOT posted mid-run.
 */
async function testNoPrematureFinalizeOnStatusFlicker() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "run", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  for (const status of ["idle", "thinking", "responding", "running", "idle", "awaiting_user", "running"]) {
    session.state.status = status;
    session.emit("state", { status });
  }
  await new Promise((resolve) => setTimeout(resolve, 700)); // > IDLE_FINALIZE_DELAY_MS

  // The cycle must still be live — and non-streaming: the (still unsealed)
  // text must not have been posted mid-run.
  session.state.messages = [textMsg("user", "u1", "run"), textMsg("assistant", "a1", "streamed content")];
  session.emit("messages", session.state.messages);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(
    !adapter.log.some((entry) => entry.text.includes("streamed content")),
    "unsealed text is not posted mid-run (no streaming)"
  );

  // Only a finished run finalizes — the answer lands on the placeholder.
  session.state.status = "completed";
  session.emit("state", { status: "completed" });
  await waitFor(
    () => adapter.edits.some((entry) => entry.text.includes("streamed content")),
    4000,
    "final render on completion"
  );
  assert.ok(adapter.edits.at(-1).text.includes("streamed content"), "final content rendered on completion");

  // After finalize the renderer is closed and the subscription torn down.
  const logAfterFinalize = adapter.log.length;
  session.state.messages = [...session.state.messages, textMsg("assistant", "a2", "LATE")];
  session.emit("messages", session.state.messages);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(
    !adapter.log.slice(logAfterFinalize).some((entry) => entry.text.includes("LATE")),
    "renderer closed and unsubscribed after finalize"
  );
  console.log("✓ status flicker does not finalize; completed does; no mid-run streaming");
}

/**
 * The new user message lands asynchronously over SSE (remote host). Rendering
 * the stale snapshot at cycle start would flash the PREVIOUS run until the
 * first event of the current run arrives.
 */
async function testNoStaleInitialRender() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "first", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "first placeholder");
  session.state.status = "completed";
  session.emit("state", { status: "completed" });
  await new Promise((resolve) => setTimeout(resolve, 700)); // first cycle finalized

  // Previous run sits in the snapshot; the new user message has NOT landed yet
  // (the fake host's dispatch does not mutate messages — mirrors remote SSE lag).
  session.state.messages = [textMsg("user", "u1", "first"), textMsg("assistant", "a1", "PREVIOUS RUN")];

  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "second", raw: null });
  await waitFor(() => adapter.sent.length === 2, 2000, "second placeholder");
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(
    !adapter.edits.some((entry) => entry.text.includes("PREVIOUS RUN")),
    "new placeholder must not flash the previous run from a stale snapshot"
  );

  // Once the current run lands (fresh SSE connection's first payload) and the
  // run finishes, it renders on the placeholder.
  session.state.messages = [
    ...session.state.messages,
    textMsg("user", "u2", "second"),
    textMsg("assistant", "a2", "CURRENT RUN"),
  ];
  session.emit("messages", session.state.messages);
  session.state.status = "completed";
  session.emit("state", { status: "completed" });
  await waitFor(() => adapter.edits.some((entry) => entry.text.includes("CURRENT RUN")), 4000, "current run render");
  console.log("✓ stale snapshot does not flash the previous run on a new placeholder");
}

/**
 * Ordered non-streaming rendering: assistant text and tool lines alternate in
 * actual part order; running tools wait; the unsealed final answer posts only
 * at finalize.
 */
async function testRebuildMessageId() {
  const { adapter, host } = await startBridge({ IM_BRIDGE_APPROVAL_TTL_MS: "5000" });
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "run tests", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  // First payload: tool-call `tc1` lives in message m1 at part index 1 (thinking
  // prepended), pending approval. Row posts with buttons.
  session.state.messages = [
    { role: "assistant", id: "m1", parts: [{ type: "text", content: "thinking" }, approvalPart()] },
  ];
  session.emit("messages", session.state.messages);
  await waitFor(() => adapter.log.some((entry) => entry.buttons?.length > 0), 2000, "approval row");
  const sendsBeforeRebuild = adapter.sent.length;

  // Rebuild: the SAME tool-call id `tc1` appears in a NEW message `m2` at part
  // index 0 — the local pipeline's message-id/part-index churn around approval.
  // With a stable `tool:<id>` key this updates the SAME segment in place; a
  // message-scoped key would orphan the posted row and emit a duplicate send.
  session.state.messages = [{ role: "assistant", id: "m2", parts: [approvalPart()] }];
  session.emit("messages", session.state.messages);
  await waitFor(
    () => adapter.log.filter((entry) => entry.buttons?.length > 0).length === 1,
    2000,
    "single row after rebuild"
  );
  // No duplicate send: the number of sends is unchanged after the rebuild.
  assert.equal(adapter.sent.length, sendsBeforeRebuild, "rebuild must not re-send a duplicate row");

  // Now mark the part approved+output (simulating the resumed pipeline after the
  // approval); the same segment should edit to a terminal line and drop buttons.
  session.state.messages = [
    {
      role: "assistant",
      id: "m2",
      parts: [
        {
          type: "tool-call",
          id: "tc1",
          name: "run_command",
          arguments: JSON.stringify({ command: "npm test" }),
          state: "tool-result",
          approval: { id: "ap1", needsApproval: true, approved: true },
          output: "ok",
        },
      ],
    },
  ];
  session.emit("messages", session.state.messages);
  await waitFor(
    () => adapter.edits.some((entry) => entry.buttons === undefined && entry.text.includes("✓")),
    2000,
    "resolved row edited in place (buttons dropped)"
  );

  // settle by the stable key still applies after the rebuild.
  assert.ok(adapter.log.every((entry) => entry.buttons === undefined || entry.buttons.length > 0));
  console.log(
    "✓ message-id/part-index rebuild keeps the tool row (no duplicate, in-place update, settle by stable key)"
  );
}

async function testSettleAfterPostDoneRace() {
  // Regression for the real run where an approval row was posted with
  // `done=true` (the part resolved between setButtons and the flush), so
  // `awaitingResolution` became false and the post-settle edit was skipped —
  // the row froze. The fix: a segment with buttons attached (an interaction)
  // always posts as awaiting, and a settled row forces the edit. Here we
  // drive the renderer directly through that exact race and assert the row
  // is edited (buttons dropped + outcome shown) after the click.
  const chat = { chatId: "chat1", chatType: "private" };
  const placeholderRef = { chat, messageId: "p1" };
  const edits = [];
  const posts = [];
  let counter = 0;
  const adapter = {
    caps: { markdown: false, editMessage: true, buttons: true, maxTextLength: 4096, streaming: "edit" },
    async editMessage(c, id, text, options) {
      edits.push({ messageId: id, text, buttons: options?.buttons });
    },
    async sendText(c, text, options) {
      const ref = { chat: c, messageId: `m${++counter}` };
      posts.push({ messageId: ref.messageId, text, buttons: options?.buttons });
      return ref;
    },
    async sendButtons(c, text, buttons) {
      return this.sendText(c, text, { buttons });
    },
    async setTyping() {},
  };
  const renderer = new RunRenderer({
    adapter,
    chat,
    placeholderRef,
    onError: () => {},
  });

  const pendingPart = {
    type: "tool-call",
    id: "tc1",
    name: "run_command",
    arguments: JSON.stringify({ command: "npm test" }),
    state: "input-complete",
    approval: { id: "ap1", needsApproval: true, approved: undefined },
    output: undefined,
  };
  // 1) part is PENDING when the interaction registers.
  renderer.sync([{ role: "assistant", id: "m1", parts: [pendingPart] }]);
  renderer.setButtons("tool:tc1", [{ label: "✅ Approve", data: "{}" }]);
  await waitFor(() => edits.some((e) => e.buttons?.length > 0), 2000, "post as pending interaction");

  // 2) the part resolves to DONE before the flush — the race that used to make
  //    `awaitingResolution=false`.
  renderer.sync([
    {
      role: "assistant",
      id: "m1",
      parts: [
        {
          type: "tool-call",
          id: "tc1",
          name: "run_command",
          arguments: JSON.stringify({ command: "npm test" }),
          state: "tool-result",
          approval: { id: "ap1", needsApproval: true, approved: true },
          output: "ok",
        },
      ],
    },
  ]);

  // 3) the click settles the row; the follow-up edit must drop buttons and
  //    show the outcome even though the projection read `done` at post time.
  const settled = renderer.settle("tool:tc1", "📎 run_command · npm test · ✓ approved");
  assert.equal(settled, true, "settle applies on the interaction row");
  await waitFor(
    () => edits.some((e) => e.buttons === undefined && e.text.includes("✓ approved")),
    2000,
    "row edited after settle (buttons dropped, outcome shown)"
  );
  console.log("✓ approval posted in a done race still settles in place (buttons dropped, outcome shown)");
}

async function testOrderedSegments() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "interleaved", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  session.state.messages = [
    textMsg("user", "u1", "interleaved"),
    {
      role: "assistant",
      id: "a1",
      parts: [
        toolPart("t1", "run_command", { command: "pnpm build" }, { success: true }),
        { type: "text", content: "build ok" },
        toolPart("t2", "grep", { pattern: "x" }, { matches: [1, 2] }),
        { type: "text", content: "final answer" },
      ],
    },
  ];
  session.emit("messages", session.state.messages);
  await waitFor(() => adapter.log.filter((entry) => entry.op === "send").length === 3, 2000, "sealed segments posted");

  // Placeholder (⏳ send) claimed by the first tool line via edit; then text, tool.
  const claim = adapter.log.find((entry) => entry.op === "edit" && entry.messageId === adapter.sent[0].ref.messageId);
  assert.ok(claim, "first segment claims the placeholder");
  assert.ok(claim.text.includes("run_command") && claim.text.includes("✓"), "tool line first");
  const sends = adapter.log.filter((entry) => entry.op === "send" && entry.text !== "⏳");
  assert.equal(sends[0].text, "build ok", "text second");
  assert.ok(sends[1].text.includes("grep") && sends[1].text.includes("2 matches"), "tool third");
  assert.ok(
    !adapter.log.some((entry) => entry.text.includes("final answer")),
    "unsealed final text waits for finalize"
  );

  session.state.status = "completed";
  session.emit("state", { status: "completed" });
  await waitFor(() => adapter.log.some((entry) => entry.text.includes("final answer")), 4000, "answer at finalize");
  console.log("✓ segments post in part order (tool/text interleaved); answer lands at finalize");
}

/** A running tool without an interaction must not post a mid-state line. */
async function testRunningToolNotPosted() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "work", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  session.state.messages = [
    textMsg("user", "u1", "work"),
    {
      role: "assistant",
      id: "a1",
      parts: [{ type: "text", content: "checking" }, toolPart("t1", "run_command", { command: "sleep 5" })],
    },
  ];
  session.emit("messages", session.state.messages);
  await waitFor(() => adapter.log.some((entry) => entry.text === "checking"), 2000, "sealed text posted");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    !adapter.log.some((entry) => entry.text.includes("run_command")),
    "running tool without interaction is not posted"
  );
  console.log("✓ running tool (no interaction) waits; only sealed text posts");
}

/** Oversized final answer: head claims the placeholder, the rest follow up. */
async function testFinalizeSplit() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "big reply", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  session.state.messages = [textMsg("assistant", "a1", "a".repeat(9000))];
  session.emit("messages", session.state.messages);
  session.state.status = "completed";
  session.emit("state", { status: "completed" });
  await waitFor(
    () => adapter.sent.filter((entry) => entry.text.startsWith("a")).length === 2,
    4000,
    "follow-up chunks"
  );
  const followUps = adapter.sent.filter((entry) => entry.text.startsWith("a"));
  assert.ok(followUps[0].text.length <= 4096 && followUps[1].text.length <= 4096);
  assert.ok(
    adapter.edits.some((entry) => entry.text.startsWith("a") && entry.messageId === adapter.sent[0].ref.messageId),
    "head chunk claims the placeholder"
  );
  console.log("✓ finalize split: oversized answer → head edit + follow-up messages");
}

/** A run that finishes without ever rendering a segment replaces the ⏳. */
async function testEmptyRunFinalizeFallback() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "nothing", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  session.state.status = "completed";
  session.emit("state", { status: "completed" });
  await waitFor(() => adapter.edits.some((entry) => entry.text === "✅ done"), 4000, "fallback edit");
  console.log("✓ empty run finalizes the placeholder to ✅ done");
}

async function testRestartRecovery() {
  const dir = join(tmpBase, "recovery");
  const config = makeConfig({ IM_BRIDGE_DATA_DIR: dir });
  const hostA = createFakeHost();
  const resolverA = new SessionResolver(hostA, config);
  await resolverA.init();
  const target = { ...CHAT };
  const created = await resolverA.getOrCreate("mock", target, "u1");
  assert.equal(created.created, true);
  await new Promise((resolve) => setTimeout(resolve, 50)); // journal flush

  const hostB = createFakeHost();
  hostB.sessions.set(created.entry.agentId, created.session);
  const resolverB = new SessionResolver(hostB, config);
  await resolverB.init();
  const resumed = await resolverB.getOrCreate("mock", target, "u1");
  assert.equal(resumed.created, false, "mapping restored from journal");
  assert.equal(resumed.session.id, created.entry.agentId, "session reconnected via host.connect");
  assert.ok(hostB.connectCalls.includes(created.entry.agentId), "host.connect used");
  console.log("✓ restart recovery: sessions.json → host.connect restores the mapping");
}

async function testSplitter() {
  const fenced = `before\n\`\`\`js\n${"x".repeat(5000)}\n\`\`\`\nafter`;
  const chunks = splitMessage(fenced, 4096);
  assert.ok(chunks.length > 1, "long text split");
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 4096, `chunk length ${chunk.length} ≤ 4096`);
    const fences = (chunk.match(/```/g) ?? []).length;
    assert.equal(fences % 2, 0, "no chunk ends inside a code fence");
  }
  assert.ok(chunks.at(-1).includes("after"), "content preserved across chunks");

  const short = splitMessage("hello", 4096);
  assert.deepEqual(short, ["hello"]);
  console.log(`✓ splitter: ${chunks.length} chunks, fences balanced, content preserved`);
}

// ============================================================================

const tests = [
  testInboundDispatch,
  testApprovalButton,
  testAskUserButton,
  testOneMessagePerApproval,
  testTtlAutoDeny,
  testAllowlistRejection,
  testSteerWhileRunning,
  testNoPrematureFinalizeOnStatusFlicker,
  testNoStaleInitialRender,
  testOrderedSegments,
  testRebuildMessageId,
  testSettleAfterPostDoneRace,
  testRunningToolNotPosted,
  testRestartRecovery,
  testSplitter,
  testFinalizeSplit,
  testEmptyRunFinalizeFallback,
];

let failed = 0;
for (const test of tests) {
  try {
    await test();
  } catch (error) {
    failed += 1;
    console.error(`✗ ${test.name}:`, error);
  }
}

// Tear down live cycles so typing/TTL timers don't hold the process open.
for (const bridge of startedBridges) {
  await bridge.stop().catch(() => {});
}
rmSync(tmpBase, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed}/${tests.length} validation(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} validations passed.`);
