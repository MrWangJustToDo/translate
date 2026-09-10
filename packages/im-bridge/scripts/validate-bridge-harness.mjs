/**
 * Shared harness for the im-bridge validation scripts: mock ChatAdapter, fake
 * AgentSession/Host, config factory and the interaction part builders. Split
 * out of validate-bridge.mjs so each scenario file stays under the lint
 * max-lines cap.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const { createImBridge, parseBridgeConfig, SessionResolver, splitMessage, RunRenderer } =
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

export function createFakeHost() {
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

export function createMockAdapter(options = {}) {
  const delayMs = options.delayMs ?? 0;
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
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const ref = { messageId: `m${++counter}`, chat: target };
      sent.push({ ref, text, buttons: options?.buttons });
      log.push({ op: "send", messageId: ref.messageId, text, buttons: options?.buttons });
      return ref;
    },
    async sendButtons(target, text, buttons) {
      return adapter.sendText(target, text, { buttons });
    },
    async editMessage(target, messageId, text, options) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
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

export const CHAT = { chatId: "chat1", chatType: "private" };
export const tmpBase = mkdtempSync(join(tmpdir(), "im-bridge-validate-"));

export function makeConfig(env = {}) {
  return parseBridgeConfig({
    REMOTE_SESSION: "http://localhost:59999",
    TELEGRAM_BOT_TOKEN: "test-token",
    IM_BRIDGE_APPROVAL_TTL_MS: "120",
    IM_BRIDGE_DATA_DIR: join(tmpBase, env.dirSuffix ?? "default"),
    ...env,
  });
}

export async function waitFor(predicate, timeoutMs = 2000, what = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

export function approvalPart() {
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

export function askUserPart() {
  return {
    type: "tool-call",
    id: "tc2",
    name: "ask_user",
    arguments: JSON.stringify({ question: "Pick one", options: ["Alpha", "Beta"] }),
    state: "input-complete",
    output: undefined,
  };
}

export function askUserNoOptionsPart() {
  return {
    type: "tool-call",
    id: "tc3",
    name: "ask_user",
    arguments: JSON.stringify({ question: "What is your name?" }),
    state: "input-complete",
    output: undefined,
  };
}

export function askUserMultiSelectPart() {
  return {
    type: "tool-call",
    id: "tc4",
    name: "ask_user",
    arguments: JSON.stringify({ question: "Pick some", options: ["Alpha", "Beta"], multiSelect: true }),
    state: "input-complete",
    output: undefined,
  };
}

/** Stopped after the suite so live cycles' typing/TTL timers don't hang the process. */
export const startedBridges = [];

export async function startBridge(env = {}, adapterOptions = {}) {
  const config = makeConfig(env);
  const host = createFakeHost();
  const adapter = createMockAdapter(adapterOptions);
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
