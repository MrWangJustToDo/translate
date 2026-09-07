/**
 * BridgeRuntime — wires a {@link ChatAdapter} onto AgentSessions.
 *
 * Inbound:  message → allowlist → session resolver → dispatch send/steer
 *           (steer while the agent pump is running, send when idle).
 * Outbound: subscribe messages/state per reply cycle → renderReply →
 *           StreamUpdater edits the placeholder in place; pending ask_user /
 *           approval interactions render as buttons backed by
 *           PendingInteractionStore (TTL auto-deny).
 *
 * The runtime is transport-agnostic: adapters translate platforms, the runtime
 * owns orchestration. Sessions are remote (`createRemoteAgentSessionHost`) by
 * default — the same path as the CLI's `--remote-session`.
 */

import { createRemoteAgentSessionHost } from "@my-agent/server/client";

import { AccessControl } from "./access.js";
import { decodeButtonPayload, PendingInteractionStore, type PendingRecord } from "./interaction/pending.js";
import { renderReply, renderResolved } from "./interaction/render.js";
import { SessionResolver, sessionKeyOf } from "./session-resolver.js";
import { StreamUpdater } from "./streaming/stream-updater.js";

import type { BridgeConfig } from "./config.js";
import type { ButtonCallback, ChatAdapter, ChatTarget, InboundMessage, PendingInteraction } from "./types.js";
import type { AgentSession, AgentSessionCommand, AgentSessionHost } from "@my-agent/core";
import type { UIMessage } from "@tanstack/ai";

export interface BridgeRuntimeOptions {
  config: BridgeConfig;
  adapter: ChatAdapter;
  /** Host override for tests; defaults to `createRemoteAgentSessionHost({ baseUrl })`. */
  host?: AgentSessionHost;
  onError?: (error: unknown) => void;
}

interface ReplyCycle {
  chatKey: string;
  chat: ChatTarget;
  /** User that started the cycle — allowed to answer its interactions. */
  userId: string;
  updater: StreamUpdater;
  unsubscribe: () => void;
  finalizeTimer: ReturnType<typeof setTimeout> | null;
  /** Interaction ids already registered as buttons on this cycle. */
  registered: Set<string>;
}

const IDLE_FINALIZE_DELAY_MS = 500;
export class BridgeRuntime {
  private readonly config: BridgeConfig;
  private readonly adapter: ChatAdapter;
  private readonly host: AgentSessionHost;
  private readonly access: AccessControl;
  private readonly resolver: SessionResolver;
  private readonly pending: PendingInteractionStore;
  private readonly onError: (error: unknown) => void;

  /** chatKey → live session, used by button callbacks and TTL expiry. */
  private readonly activeSessions = new Map<string, AgentSession>();
  /** chatKey → cycle creation (placeholder send is async; dedupes double-begin). */
  private readonly cycles = new Map<string, Promise<ReplyCycle>>();
  private started = false;

  constructor(options: BridgeRuntimeOptions) {
    this.config = options.config;
    this.adapter = options.adapter;
    this.host = options.host ?? throwHostRequired();
    this.access = new AccessControl(options.config);
    this.resolver = new SessionResolver(this.host, options.config);
    this.onError = options.onError ?? (() => {});
    this.pending = new PendingInteractionStore(options.config.approvalTtlMs, (record) =>
      this.expireInteraction(record)
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.resolver.init();
    this.adapter.onMessage((msg) => this.handleMessage(msg));
    this.adapter.onButton((cb) => this.handleButton(cb));
    await this.adapter.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.pending.clear();
    const creations = [...this.cycles.values()];
    this.cycles.clear();
    for (const creation of creations) {
      const cycle = await creation.catch(() => null);
      if (cycle) this.teardownCycle(cycle);
    }
    await this.adapter.stop();
  }

  // ---------------------------------------------------------------------------
  // Inbound
  // ---------------------------------------------------------------------------

  private async handleMessage(msg: InboundMessage): Promise<void> {
    try {
      if (!this.access.allows(msg)) {
        // Say nothing in groups (avoid noise); inform the user in DMs.
        if (msg.chat.chatType === "private") await this.safeSendText(msg.chat, "⛔ Not authorized.");
        return;
      }
      if (msg.command === "new") {
        await this.finalizeCycle(msg.platform, msg.chat);
        await this.resolver.reset(msg.platform, msg.chat);
        await this.safeSendText(msg.chat, "🔄 Session cleared. Send a message to start a new one.");
        return;
      }
      if (msg.command === "stop") {
        const key = sessionKeyOf(msg.platform, msg.chat);
        const session = this.activeSessions.get(key);
        if (session) await this.dispatch(session, { type: "stop" });
        return;
      }

      void this.adapter.setTyping?.(msg.chat).catch(() => {});

      const { session } = await this.resolveSession(msg);
      const running = session.getSnapshot().status === "running";
      if (running) {
        // Steer into the running cycle. Finalizing + a new placeholder here
        // would split one run across multiple chat messages AND re-register
        // its pending interactions as duplicate (dead) button rows — the old
        // buttons stay clickable-looking but resolve to "expired".
        await this.dispatch(session, { type: "steer", content: msg.text });
        return;
      }
      await this.finalizeCycle(msg.platform, msg.chat);

      const result = await this.dispatch(session, { type: "send", content: msg.text });
      if (!result.ok && result.code === "not_found") {
        // Stale mapping (e.g. server restarted) — heal and retry once.
        this.resolver.invalidate(msg.platform, msg.chat);
        const healed = await this.resolveSession(msg);
        await this.dispatch(healed.session, { type: "send", content: msg.text });
        this.beginReplyCycle(healed.session, msg);
        return;
      }
      this.beginReplyCycle(session, msg);
    } catch (error) {
      this.onError(error);
      await this.safeSendText(msg.chat, `⚠️ ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`);
    }
  }

  private async resolveSession(msg: InboundMessage): Promise<{ session: AgentSession; chatKey: string }> {
    const { session } = await this.resolver.getOrCreate(msg.platform, msg.chat, msg.userId);
    const chatKey = sessionKeyOf(msg.platform, msg.chat);
    this.activeSessions.set(chatKey, session);
    return { session, chatKey };
  }

  private async dispatch(session: AgentSession, command: AgentSessionCommand) {
    try {
      return await session.dispatch(command);
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // ---------------------------------------------------------------------------
  // Outbound (reply cycles)
  // ---------------------------------------------------------------------------

  private beginReplyCycle(session: AgentSession, msg: InboundMessage): void {
    const chatKey = sessionKeyOf(msg.platform, msg.chat);
    // One reply cycle per chat: an in-flight creation (double message, race
    // between sendText and the map insert) reuses the existing cycle instead
    // of spawning a second placeholder streaming the same run.
    if (this.cycles.has(chatKey)) return;
    const creation: Promise<ReplyCycle> = this.adapter
      .sendText(msg.chat, "⏳")
      .then((reply): ReplyCycle => {
        const cycle: ReplyCycle = {
          chatKey,
          chat: msg.chat,
          userId: msg.userId,
          updater: new StreamUpdater({
            adapter: this.adapter,
            reply,
            editIntervalMs: this.config.editIntervalMs,
            onError: this.onError,
          }),
          unsubscribe: session.subscribe((event) => this.onSessionEvent(cycle, event), {
            channels: ["messages", "state"],
          }),
          finalizeTimer: null,
          registered: new Set(),
        };
        // First render in case events already flew by between dispatch and subscribe.
        this.renderCycle(cycle, session.getSnapshot().messages as UIMessage[]);
        return cycle;
      })
      .catch((error) => {
        if (this.cycles.get(chatKey) === creation) this.cycles.delete(chatKey);
        this.onError(error);
        throw error;
      });
    this.cycles.set(chatKey, creation);
  }

  private onSessionEvent(cycle: ReplyCycle, event: { channel: string; payload: unknown }): void {
    try {
      if (event.channel === "messages") {
        this.renderCycle(cycle, event.payload as UIMessage[]);
        return;
      }
      if (event.channel === "state") {
        const snapshot = this.activeSessions.get(cycle.chatKey)?.getSnapshot();
        if (snapshot && snapshot.status !== "running") this.scheduleFinalize(cycle);
      }
    } catch (error) {
      this.onError(error);
    }
  }

  private renderCycle(cycle: ReplyCycle, messages: UIMessage[]): void {
    const rendered = renderReply(messages);
    for (const pending of rendered.pending) {
      const id = pending.kind === "approval" ? pending.approvalId : pending.toolCallId;
      if (cycle.registered.has(id)) continue;
      cycle.registered.add(id);
      // One dedicated message per interaction — buttons never mix across
      // approvals/ask_user on a shared streaming message.
      void this.postInteractionMessage(cycle, pending);
    }
    // The streaming message shows assistant text + tool status lines only.
    cycle.updater.update(rendered.text);
  }

  private async postInteractionMessage(cycle: ReplyCycle, pending: PendingInteraction): Promise<void> {
    try {
      // Register BEFORE sending so a button click can never race the pending
      // record's creation (renderCycle fires from a synchronous event; a fast
      // callback could otherwise resolve before the send completes).
      const requestId = this.pending.nextRequestId();
      const record = this.pending.register(
        pending,
        {
          chatKey: cycle.chatKey,
          chat: cycle.chat,
          userId: cycle.userId,
          messageId: null,
        },
        requestId
      );
      const buttons = this.pending.buttonsFor(pending, requestId);
      const ref = await this.adapter.sendButtons(cycle.chat, describePending(pending), buttons);
      record.messageId = ref.messageId;
    } catch (error) {
      this.onError(error);
    }
  }

  private scheduleFinalize(cycle: ReplyCycle): void {
    if (cycle.finalizeTimer !== null) return;
    cycle.finalizeTimer = setTimeout(() => {
      void this.finalizeCycleObject(cycle);
    }, IDLE_FINALIZE_DELAY_MS);
  }

  private async finalizeCycle(platform: string, chat: ChatTarget): Promise<void> {
    const creation = this.cycles.get(sessionKeyOf(platform, chat));
    if (!creation) return;
    const cycle = await creation.catch(() => null);
    if (cycle) await this.finalizeCycleObject(cycle);
  }

  private async finalizeCycleObject(cycle: ReplyCycle): Promise<void> {
    if (cycle.finalizeTimer !== null) {
      clearTimeout(cycle.finalizeTimer);
      cycle.finalizeTimer = null;
    }
    this.cycles.delete(cycle.chatKey);
    cycle.updater.update(renderReply(this.activeSessionMessages(cycle.chatKey)).text || "✅ done");
    try {
      await cycle.updater.finalize();
    } catch (error) {
      this.onError(error);
    } finally {
      cycle.unsubscribe();
    }
  }

  private teardownCycle(cycle: ReplyCycle): void {
    if (cycle.finalizeTimer !== null) clearTimeout(cycle.finalizeTimer);
    cycle.unsubscribe();
  }

  private activeSessionMessages(chatKey: string): UIMessage[] {
    return (this.activeSessions.get(chatKey)?.getSnapshot().messages ?? []) as UIMessage[];
  }

  // ---------------------------------------------------------------------------
  // Buttons (approval / ask_user)
  // ---------------------------------------------------------------------------

  private async handleButton(cb: ButtonCallback): Promise<void> {
    try {
      const payload = decodeButtonPayload(cb.data);
      if (!payload) {
        await cb.ack();
        return;
      }
      const record = this.pending.resolve(payload);
      if (!record) {
        await cb.ack();
        await this.safeEditText(cb, "⏳ Expired or already answered.");
        return;
      }
      if (!this.pending.canAnswer(record, cb.userId)) {
        await cb.ack();
        return;
      }

      const session = this.activeSessions.get(record.chatKey);
      const outcome = await this.applyInteraction(session, record, payload);
      await cb.ack();
      await this.safeEditText(cb, renderResolved(describePending(record.pending), outcome));
    } catch (error) {
      this.onError(error);
      await cb.ack();
    }
  }

  private async applyInteraction(
    session: AgentSession | undefined,
    record: PendingRecord,
    payload: NonNullable<ReturnType<typeof decodeButtonPayload>>
  ): Promise<string> {
    if (!session) return "session unavailable";
    if (record.pending.kind === "approval") {
      const approved = payload.a === "y";
      await this.dispatch(session, {
        type: "respondApproval",
        approvalId: record.pending.approvalId,
        approved,
        ...(approved ? {} : { reason: "denied via IM" }),
      });
      return approved ? "✅ approved" : "❌ denied";
    }
    const option = record.pending.options[payload.i ?? -1] ?? "(no answer)";
    await this.dispatch(session, {
      type: "addToolResult",
      toolCallId: record.pending.toolCallId,
      output: {
        question: record.pending.question,
        answer: option,
        hasOptions: record.pending.options.length > 0,
        durationMs: this.config.approvalTtlMs,
        cachedOutputPath: null,
      },
    });
    return `▸ ${option}`;
  }

  /** TTL expiry → auto-deny (approval) / timeout answer (ask_user). */
  private async expireInteraction(record: PendingRecord): Promise<void> {
    try {
      const session = this.activeSessions.get(record.chatKey);
      if (!session) return;
      if (record.pending.kind === "approval") {
        await this.dispatch(session, {
          type: "respondApproval",
          approvalId: record.pending.approvalId,
          approved: false,
          reason: "timed out",
        });
      } else {
        await this.dispatch(session, {
          type: "addToolResult",
          toolCallId: record.pending.toolCallId,
          output: {
            question: record.pending.question,
            answer: "(timed out)",
            hasOptions: record.pending.options.length > 0,
            durationMs: this.config.approvalTtlMs,
            cachedOutputPath: null,
          },
        });
      }
    } catch (error) {
      this.onError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async safeSendText(chat: ChatTarget, text: string): Promise<void> {
    try {
      await this.adapter.sendText(chat, text);
    } catch (error) {
      this.onError(error);
    }
  }

  private async safeEditText(cb: ButtonCallback, text: string): Promise<void> {
    try {
      await this.adapter.editMessage(cb.chat, cb.messageId, text);
    } catch (error) {
      this.onError(error);
    }
  }
}

function throwHostRequired(): never {
  throw new Error("BridgeRuntime requires a host (or use createImBridge which wires the remote host).");
}

/**
 * Create a bridge bound to a remote agent server — the same session path as the
 * CLI's `--remote-session`. Pass `host` to override (tests / in-process core).
 */
export function createImBridge(options: BridgeRuntimeOptions): BridgeRuntime {
  const host = options.host ?? createRemoteAgentSessionHost({ baseUrl: options.config.remoteSession });
  return new BridgeRuntime({ ...options, host });
}

function describePending(pending: PendingInteraction): string {
  return pending.kind === "approval" ? `Approval · ${pending.question}` : `Question · ${pending.question}`;
}
