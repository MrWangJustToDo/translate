/**
 * Offline validation for @my-agent/im-bridge — mock ChatAdapter + fake
 * AgentSession, no server / no Telegram required.
 *
 * Covers: inbound → dispatch, approval button → respondApproval, ask_user
 * button → addToolResult, TTL auto-deny, allowlist rejection, restart recovery
 * (sessions.json → host.connect), code-block-aware splitting, finalize split.
 *
 * Run after `pnpm build:im-bridge`:
 *   node packages/im-bridge/scripts/validate-bridge.mjs
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createImBridge, parseBridgeConfig, SessionResolver, splitMessage, StreamUpdater } =
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
  let counter = 0;
  const adapter = {
    platform: "mock",
    caps: { markdown: false, editMessage: true, buttons: true, maxTextLength: 4096, streaming: "edit" },
    sent,
    edits,
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
      return ref;
    },
    async sendButtons(target, text, buttons) {
      return adapter.sendText(target, text, { buttons });
    },
    async editMessage(target, messageId, text, options) {
      edits.push({ messageId, text, buttons: options?.buttons });
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
    IM_BRIDGE_EDIT_INTERVAL_MS: "10",
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
  const bridge = createImBridge({
    config,
    adapter,
    host,
    onError: (error) => errors.push(error),
  });
  await bridge.start();
  return { config, host, adapter, errors, bridge };
}

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
  await waitFor(() => adapter.sent.some((entry) => entry.buttons?.length > 0), 2000, "approval message");
  const approvalMsg = adapter.sent.find((entry) => entry.buttons?.length > 0);
  const buttons = approvalMsg.buttons;
  const approve = buttons.find((button) => button.label === "✅ Approve");
  const deny = buttons.find((button) => button.label === "❌ Deny");
  assert.ok(approve && deny, "approve/deny buttons rendered");

  await adapter.emitButton({
    platform: "mock",
    chat: CHAT,
    messageId: approvalMsg.ref.messageId,
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
  console.log("✓ approval button → dispatch respondApproval(approved=true)");
}

async function testAskUserButton() {
  const { adapter, host } = await startBridge({ IM_BRIDGE_APPROVAL_TTL_MS: "5000" });
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "ask me", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  session.state.messages = [{ role: "assistant", parts: [askUserPart()] }];
  session.emit("messages", session.state.messages);
  await waitFor(() => adapter.sent.some((entry) => entry.buttons?.length > 0), 2000, "ask_user message");
  const askMsg = adapter.sent.find((entry) => entry.buttons?.length > 0);
  const buttons = askMsg.buttons;
  assert.deepEqual(
    buttons.map((button) => button.label),
    ["Alpha", "Beta"]
  );

  await adapter.emitButton({
    platform: "mock",
    chat: CHAT,
    messageId: askMsg.ref.messageId,
    userId: "u1",
    data: buttons[1].data,
    ack: async () => {},
  });
  await waitFor(() => session.dispatched.some((cmd) => cmd.type === "addToolResult"), 2000, "addToolResult dispatch");
  const command = session.dispatched.find((cmd) => cmd.type === "addToolResult");
  assert.equal(command.toolCallId, "tc2");
  assert.equal(command.output.answer, "Beta");
  assert.equal(command.output.hasOptions, true);
  console.log("✓ ask_user option button → dispatch addToolResult(answer)");
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
    () => adapter.sent.filter((entry) => entry.buttons?.length > 0).length === 2,
    2000,
    "two approval messages"
  );
  const approvalMsgs = adapter.sent.filter((entry) => entry.buttons?.length > 0);
  for (const msg of approvalMsgs) {
    assert.equal(msg.buttons.length, 2, "one approval = exactly 2 buttons (approve/deny)");
  }
  assert.notEqual(approvalMsgs[0].ref.messageId, approvalMsgs[1].ref.messageId, "distinct messages");
  console.log("✓ two pending approvals → two dedicated messages, one approval each");
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
  console.log("✓ pending approval TTL expiry → auto-deny (approved=false, reason=timed out)");
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

/**
 * The status flickers `thinking`/`responding`/`running` many times mid-run and
 * pauses at `awaiting_user` for ask_user. Only a finished run (`completed` /
 * `error` / `aborted`) may finalize — finalizing earlier freezes the
 * placeholder and unsubscribes, so the reply only surfaces one message later.
 */
async function testNoPrematureFinalizeOnStatusFlicker() {
  const { adapter, host } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "run", raw: null });
  const session = [...host.sessions.values()][0];
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");

  for (const status of ["thinking", "responding", "running", "thinking", "awaiting_user", "running"]) {
    session.state.status = status;
    session.emit("state", { status });
  }
  await new Promise((resolve) => setTimeout(resolve, 700)); // > IDLE_FINALIZE_DELAY_MS

  // The cycle must still be live: a messages event still edits the placeholder.
  session.state.messages = [textMsg("user", "u1", "run"), textMsg("assistant", "a1", "streamed content")];
  session.emit("messages", session.state.messages);
  await waitFor(
    () => adapter.edits.some((entry) => entry.text.includes("streamed content")),
    2000,
    "placeholder still streaming after status flicker"
  );

  // Only a finished run finalizes.
  session.state.status = "completed";
  session.emit("state", { status: "completed" });
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.ok(adapter.edits.at(-1).text.includes("streamed content"), "final content rendered on completion");

  // After finalize the updater is closed and the subscription torn down.
  const editsAfterFinalize = adapter.edits.length;
  session.state.messages = [...session.state.messages, textMsg("assistant", "a2", "LATE")];
  session.emit("messages", session.state.messages);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(
    !adapter.edits.slice(editsAfterFinalize).some((entry) => entry.text.includes("LATE")),
    "updater closed and unsubscribed after finalize"
  );
  console.log("✓ status flicker (thinking/responding/awaiting_user) does not finalize; completed does");
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

  // Once the current run lands (fresh SSE connection's first payload), it renders.
  session.state.messages = [
    ...session.state.messages,
    textMsg("user", "u2", "second"),
    textMsg("assistant", "a2", "CURRENT RUN"),
  ];
  session.emit("messages", session.state.messages);
  await waitFor(() => adapter.edits.some((entry) => entry.text.includes("CURRENT RUN")), 2000, "current run render");
  console.log("✓ stale snapshot does not flash the previous run on a new placeholder");
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

async function testFinalizeSplit() {
  const { adapter } = await startBridge();
  await adapter.emitMessage({ platform: "mock", chat: CHAT, userId: "u1", text: "big reply", raw: null });
  await waitFor(() => adapter.sent.length === 1, 2000, "placeholder");
  const updater = new StreamUpdater({
    adapter,
    reply: adapter.sent[0].ref,
    editIntervalMs: 10,
    onError: () => {},
  });
  updater.update("a".repeat(9000));
  await updater.finalize();
  const followUps = adapter.sent.filter((entry) => entry.text.startsWith("a"));
  assert.equal(followUps.length, 2, "9000 chars → 1 follow-up chunk beyond head");
  assert.ok(followUps[0].text.length <= 4096 && followUps[1].text.length <= 4096);
  console.log("✓ finalize split: oversized content → head edit + follow-up messages");
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
  testRestartRecovery,
  testSplitter,
  testFinalizeSplit,
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

rmSync(tmpBase, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed}/${tests.length} validation(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} validations passed.`);
