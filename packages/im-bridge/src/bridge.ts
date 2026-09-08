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

import { isActiveStatus } from "@my-agent/core";
import { createRemoteAgentSessionHost } from "@my-agent/server/client";

import { AccessControl } from "./access.js";
import { decodeButtonPayload, PendingInteractionStore, type PendingRecord } from "./interaction/pending.js";
import { renderReply, renderResolved } from "./interaction/render.js";
import { createLocalSessionHost } from "./local-host.js";
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
  /** null until the placeholder message resolves; renders buffer meanwhile. */
  updater: StreamUpdater | null;
  /** Latest render while `updater` is null; the final text once retired. */
  pendingText: string;
  /** Retired (finalized / healed over) — late events and edits are ignored. */
  closed: boolean;
  unsubscribe: () => void;
  finalizeTimer: ReturnType<typeof setTimeout> | null;
  /** Interaction ids already registered as buttons on this cycle. */
  registered: Set<string>;
}

const IDLE_FINALIZE_DELAY_MS = 500;

/**
 * Statuses that mean a run has really finished.
 *
 * NOT everything ≠ "running", and NOT "idle": the server emits a reconcile
 * `idle` right after the user message lands (BEFORE the pump flips to
 * `running`), and mid-run it flickers through `thinking` / `responding` /
 * `waiting` / `awaiting_user` (ask_user pause) / `compacting`. Finalizing on
 * any of those freezes the placeholder and tears down the subscription while
 * the run is still producing content, so the reply only surfaces one message
 * later (stale snapshot on the next cycle).
 */
function isRunFinished(status: string): boolean {
  return status === "completed" || status === "error" || status === "aborted";
}
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
  /** chatKey → live reply cycle (subscription established synchronously). */
  private readonly cycles = new Map<string, ReplyCycle>();
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
    this.adapter.onMessage((msg) => {
      // Fire-and-forget: dispatch(send) blocks server-side until the whole run
      // finishes — awaiting it in the adapter's update loop would stall
      // steering and /stop for the run's entire duration.
      const handled = this.handleMessage(msg);
      handled.catch(() => {});
      return Promise.resolve();
    });
    this.adapter.onButton((cb) => this.handleButton(cb));
    await this.adapter.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.pending.clear();
    for (const cycle of this.cycles.values()) {
      cycle.closed = true;
      this.teardownCycle(cycle);
    }
    this.cycles.clear();
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
        // Stop an in-flight run first — finalizeCycleObject skips active runs
        // (see the stale-finalize guard there), so clearing must not race one.
        const active = this.activeSessions.get(sessionKeyOf(msg.platform, msg.chat));
        if (active && isActiveStatus(active.getSnapshot().status)) {
          await this.dispatch(active, { type: "stop" });
        }
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
      const status = session.getSnapshot().status;
      // Active-run detection mirrors the app layer: mid-run status flickers
      // through thinking/responding/waiting/compacting — steering into all of
      // them keeps ONE live stream instead of finalizing the cycle and
      // splitting the run across chat messages (with duplicate dead buttons).
      // `awaiting_user` is excluded: the agent is paused on a client tool, the
      // text is a new turn, not a steer into the paused pump.
      const running = isActiveStatus(status) && status !== "awaiting_user";
      if (running) {
        // Steer into the running cycle. Finalizing + a new placeholder here
        // would split one run across multiple chat messages AND re-register
        // its pending interactions as duplicate (dead) button rows — the old
        // buttons stay clickable-looking but resolve to "expired".
        const steer = await this.dispatch(session, { type: "steer", content: msg.text });
        if (!steer.ok && (steer as { code?: string }).code === "not_found") {
          // Stale mapping (e.g. server restarted) — heal and start fresh
          // instead of silently swallowing every following message.
          this.resolver.invalidate(msg.platform, msg.chat);
          const healed = await this.resolveSession(msg);
          const cycle = this.beginReplyCycle(healed.session, msg);
          if (cycle) await this.dispatch(healed.session, { type: "send", content: msg.text });
        }
        return;
      }
      await this.finalizeCycle(msg.platform, msg.chat);

      // The reply cycle — and its SSE subscription — must exist BEFORE the
      // dispatch: the server runs the agent synchronously, so dispatch(send)
      // resolves only when the whole run has finished. A subscription created
      // after dispatch would miss EVERY messages/state event of the run and
      // the placeholder would stay stale until the next message's resync.
      const cycle = this.beginReplyCycle(session, msg);
      if (cycle === null) {
        // A cycle is already live (double-message race) — inject as steer.
        await this.dispatch(session, { type: "steer", content: msg.text });
        return;
      }

      const result = await this.dispatch(session, { type: "send", content: msg.text });
      if (!result.ok && result.code === "not_found") {
        // Stale mapping (e.g. server restarted) — retire the premature cycle,
        // heal and retry once.
        await this.retireCycle(cycle, "⚠️ session expired, retrying…");
        this.resolver.invalidate(msg.platform, msg.chat);
        const healed = await this.resolveSession(msg);
        const healedCycle = this.beginReplyCycle(healed.session, msg);
        if (healedCycle) await this.dispatch(healed.session, { type: "send", content: msg.text });
        return;
      }
      if (!result.ok) {
        // Transport failures (e.g. the blocking dispatch outlasting the HTTP
        // headers timeout) happen WHILE the run is live — the SSE cycle keeps
        // streaming, so only retire when no run is actually going (finished
        // OR never started — e.g. ECONNREFUSED while the snapshot was idle).
        const status = session.getSnapshot().status;
        if (isRunFinished(status) || !isActiveStatus(status)) {
          const detail = result.error ?? "dispatch failed";
          await this.retireCycle(cycle, `⚠️ ${detail.slice(0, 300)}`);
        }
      }
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

  private beginReplyCycle(session: AgentSession, msg: InboundMessage): ReplyCycle | null {
    const chatKey = sessionKeyOf(msg.platform, msg.chat);
    // One reply cycle per chat: an in-flight creation (double message, race
    // between sendText and the map insert) reuses the existing cycle instead
    // of spawning a second placeholder streaming the same run.
    if (this.cycles.has(chatKey)) return null;
    // Subscribe SYNCHRONOUSLY (before any dispatch) so no run event is missed;
    // the placeholder message goes out in parallel and edits flush once it
    // resolves (buffered in `pendingText` until then).
    const cycle: ReplyCycle = {
      chatKey,
      chat: msg.chat,
      userId: msg.userId,
      updater: null,
      pendingText: "",
      closed: false,
      unsubscribe: session.subscribe((event) => this.onSessionEvent(cycle, event), {
        channels: ["messages", "state"],
      }),
      finalizeTimer: null,
      registered: new Set(),
    };
    this.cycles.set(chatKey, cycle);
    void this.adapter
      .sendText(msg.chat, "⏳")
      .then((reply) => {
        const updater = new StreamUpdater({
          adapter: this.adapter,
          reply,
          editIntervalMs: this.config.editIntervalMs,
          onError: this.onError,
        });
        cycle.updater = updater;
        if (cycle.closed) {
          updater.update(cycle.pendingText || "✅ done");
          void updater.finalize().catch(() => {});
        } else if (cycle.pendingText) {
          updater.update(cycle.pendingText);
        }
      })
      .catch((error) => {
        // The placeholder send failed (transient 429 flood control / blocked
        // bot). Keep the cycle alive: renderCycle keeps buffering into
        // `pendingText`, and retireCycle delivers the final text directly —
        // the run's reply must not be silently lost because the placeholder
        // never landed.
        this.onError(error);
      });
    return cycle;
  }

  private onSessionEvent(cycle: ReplyCycle, event: { channel: string; payload: unknown }): void {
    try {
      if (event.channel === "messages") {
        this.renderCycle(cycle, event.payload as UIMessage[]);
        return;
      }
      if (event.channel === "state") {
        // Trust the EVENT's status, not a fresh snapshot re-read: a new run's
        // first state event can arrive while the snapshot still holds the
        // PREVIOUS run's "completed" — re-reading here armed a finalize that
        // killed the just-started run's cycle (the "✅ done" bug).
        const status =
          (event.payload as { status?: string } | undefined)?.status ??
          this.activeSessions.get(cycle.chatKey)?.getSnapshot().status;
        if (status && isRunFinished(status)) this.scheduleFinalize(cycle);
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
    if (cycle.updater) cycle.updater.update(rendered.text);
    else cycle.pendingText = rendered.text;
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
      // Reset BEFORE running: a skipped finalize (new run started, see
      // finalizeCycleObject) must leave the timer re-armable for the run's own
      // completed event, and retireCycle only clears a PENDING timer.
      cycle.finalizeTimer = null;
      void this.finalizeCycleObject(cycle);
    }, IDLE_FINALIZE_DELAY_MS);
  }

  private async finalizeCycle(platform: string, chat: ChatTarget): Promise<void> {
    const cycle = this.cycles.get(sessionKeyOf(platform, chat));
    if (cycle) await this.finalizeCycleObject(cycle);
  }

  private async finalizeCycleObject(cycle: ReplyCycle): Promise<void> {
    // The finalize decision was made up to IDLE_FINALIZE_DELAY_MS ago —
    // re-check before retiring: a steer continuation or the next run may have
    // flipped the status back to active, and retiring now would kill the live
    // stream and lose the run's output (rendered as the empty "✅ done").
    const status = this.activeSessions.get(cycle.chatKey)?.getSnapshot().status ?? "idle";
    if (isActiveStatus(status)) return;
    await this.retireCycle(cycle, renderReply(this.activeSessionMessages(cycle.chatKey)).text || "✅ done");
  }

  /** Retire a cycle: write the final text, close the updater, unsubscribe. */
  private async retireCycle(cycle: ReplyCycle, text: string): Promise<void> {
    if (cycle.closed) return;
    cycle.closed = true;
    if (cycle.finalizeTimer !== null) {
      clearTimeout(cycle.finalizeTimer);
      cycle.finalizeTimer = null;
    }
    if (this.cycles.get(cycle.chatKey) === cycle) this.cycles.delete(cycle.chatKey);
    cycle.pendingText = text;
    const updater = cycle.updater;
    if (updater) {
      updater.update(text);
      try {
        await updater.finalize();
      } catch (error) {
        this.onError(error);
      }
    } else {
      // Placeholder never resolved (send failed) — deliver the final text as
      // a fresh message instead of dropping the run's reply.
      await this.safeSendText(cycle.chat, text);
    }
    cycle.unsubscribe();
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
      // Ack FIRST — applyInteraction's dispatch blocks until the rest of the
      // run finishes, and Telegram expires the callback after ~3s (spinner on
      // the button). The confirmation edit lands when the outcome is known.
      await cb.ack();
      const outcome = await this.applyInteraction(session, record, payload);
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
 * Create a bridge. Default wiring:
 * - `REMOTE_SESSION` set → remote host (the same session path as the CLI's
 *   `--remote-session`); pass `host` to override (tests / in-process core).
 * - no `REMOTE_SESSION` → local mode: in-process host with a local CoreEnv and
 *   a direct model provider resolved from `.env` (same bootstrap as the CLI's
 *   local mode).
 */
export async function createImBridge(options: BridgeRuntimeOptions): Promise<BridgeRuntime> {
  let { config, host } = options;
  if (!host) {
    if (config.remoteSession) {
      host = createRemoteAgentSessionHost({ baseUrl: config.remoteSession });
    } else {
      const local = await createLocalSessionHost(config);
      host = local.host;
      // Session-create defaults resolved at bootstrap (remote mode leaves them unset).
      config = {
        ...config,
        model: local.defaults.model,
        modelStyle: local.defaults.style,
        modelBaseURL: local.defaults.baseURL,
        modelApiKey: local.defaults.apiKey,
        modelInfo: local.defaults.modelInfo,
        systemPrompt: local.defaults.systemPrompt,
      };
    }
  }
  return new BridgeRuntime({ ...options, config, host });
}

function describePending(pending: PendingInteraction): string {
  return pending.kind === "approval" ? `Approval · ${pending.question}` : `Question · ${pending.question}`;
}
