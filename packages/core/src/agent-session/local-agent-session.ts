/**
 * In-process AgentSession: fans domain Emitters + filtered AgentTelemetryBus into channels.
 */

import { subscribeStreamingCallback, subscribeStreamingClearCallback } from "../agent/tools/util/streaming-callback.js";
import { Emitter } from "../utils/emitter.js";

import { DEFAULT_SESSION_LIFECYCLE_EVENTS } from "./lifecycle-filter.js";
import { dispatchLocalAgentSessionCommand } from "./local-session-dispatch.js";
import { readLocalAgentSessionSnapshot } from "./local-session-snapshot.js";
import {
  DEFAULT_AGENT_SESSION_CHANNELS,
  type AgentSession,
  type AgentSessionChannel,
  type AgentSessionCommand,
  type AgentSessionCommandResult,
  type AgentSessionEvent,
  type AgentSessionSnapshot,
  type AgentSessionSubscribeOptions,
  type AgentSessionSubscriber,
} from "./types.js";

import type { AgentManager } from "../managers/agent-manager.js";
import type { ManagedAgent } from "../managers/managed-agent.js";
import type { AgentEvent } from "../managers/telemetry/agent-telemetry-bus.js";
import type { AgentEventType } from "../runtime-types/agent-events.js";

/** Manager surface used by Local Session (AgentManager satisfies this). */
export type LocalAgentSessionManager = Pick<AgentManager, "getAgent" | "getSubagents"> & {
  on?: (type: AgentEventType, listener: (event: AgentEvent) => void) => () => void;
};

export interface CreateLocalAgentSessionOptions {
  managed: ManagedAgent;
  manager?: LocalAgentSessionManager | null;
  /** Override lifecycle event filter (default {@link DEFAULT_SESSION_LIFECYCLE_EVENTS}). */
  lifecycleEvents?: readonly AgentEventType[];
}

function now(): number {
  return Date.now();
}

function channelAllowed(channel: AgentSessionChannel, selected: ReadonlySet<AgentSessionChannel>): boolean {
  return selected.has(channel);
}

function resolveChannels(options?: AgentSessionSubscribeOptions): Set<AgentSessionChannel> {
  if (options?.channels && options.channels.length > 0) {
    return new Set(options.channels);
  }
  return new Set(DEFAULT_AGENT_SESSION_CHANNELS);
}

class LocalAgentSessionImpl implements AgentSession {
  readonly id: string;
  private readonly managed: ManagedAgent;
  private readonly manager: LocalAgentSessionManager | null | undefined;
  private readonly lifecycleEvents: readonly AgentEventType[];
  /** Multicast bus for session events; all channels fan out through here. */
  private readonly events = new Emitter<Record<AgentSessionChannel, AgentSessionEvent>>();
  /** Ref-counted underlying source wiring per channel (see acquireSource). */
  private readonly sourceRefs = new Map<AgentSessionChannel, { count: number; teardown: () => void }>();

  constructor(options: CreateLocalAgentSessionOptions) {
    this.managed = options.managed;
    this.manager = options.manager ?? options.managed.manager ?? null;
    this.id = options.managed.id;
    this.lifecycleEvents = options.lifecycleEvents ?? DEFAULT_SESSION_LIFECYCLE_EVENTS;
  }

  getSnapshot(): AgentSessionSnapshot {
    return readLocalAgentSessionSnapshot(this.managed, this.manager);
  }

  getSummaryStreamSnapshot(key: string) {
    return this.managed.summaryStreams?.getSnapshot(key) ?? null;
  }

  listSummaryStreamSnapshots() {
    return this.managed.summaryStreams?.listSnapshots() ?? [];
  }

  subscribe(handler: AgentSessionSubscriber, options?: AgentSessionSubscribeOptions): () => void {
    const selected = resolveChannels(options);
    const unsubs: Array<() => void> = [];
    for (const channel of selected) {
      unsubs.push(this.events.on(channel, handler));
    }
    // Underlying sources must be wired once per session, not once per
    // subscribe() call: each subscriber registers its handler on the shared
    // bus above, and a per-subscribe source bridge would re-emit every source
    // event once per subscriber (N subscribers → N copies of every event),
    // duplicating streamed text (summary chunks arriving doubled) and other
    // payloads. Sources are ref-counted and unwired when the last subscriber
    // for a channel leaves.
    for (const channel of selected) {
      unsubs.push(this.acquireSource(channel));
    }

    // Per-subscriber reconcile: replay the extension status set that was set
    // before this subscription mounted (the source wiring itself only does
    // this once for the first subscriber on the channel).
    if (selected.has("extension-ui")) {
      const ui = this.managed.extensionRunner?.getUI();
      if (ui) {
        for (const [key, text] of Object.entries(ui.getStatus())) {
          if (text) {
            this.events.emit("extension-ui", {
              channel: "extension-ui",
              payload: { type: "set-status", key, text },
              ts: now(),
            });
          }
        }
      }
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      for (const unsub of unsubs) {
        try {
          unsub();
        } catch {
          // Ignore teardown errors
        }
      }
    };
  }

  /** Ref-count the underlying source wiring for one channel. */
  private acquireSource(channel: AgentSessionChannel): () => void {
    const ref = this.sourceRefs.get(channel);
    if (ref) {
      ref.count += 1;
    } else {
      this.sourceRefs.set(channel, { count: 1, teardown: this.wireSource(channel) });
    }
    return () => this.releaseSource(channel);
  }

  private releaseSource(channel: AgentSessionChannel): void {
    const ref = this.sourceRefs.get(channel);
    if (!ref) return;
    ref.count -= 1;
    if (ref.count <= 0) {
      this.sourceRefs.delete(channel);
      try {
        ref.teardown();
      } catch {
        // Ignore teardown errors
      }
    }
  }

  /**
   * Wire the underlying event source for one channel. Runs once per session
   * regardless of how many subscribers listen on the channel.
   */
  private wireSource(channel: AgentSessionChannel): () => void {
    const managed = this.managed;
    const manager = this.manager;
    // Narrow selection containing only the channel being wired; the guards
    // below reuse the channelAllowed() helper against it.
    const selected = new Set([channel]);
    const unsubs: Array<() => void> = [];

    if (channelAllowed("state", selected)) {
      unsubs.push(
        managed.on("change", (payload) => {
          this.events.emit("state", { channel: "state", payload, ts: now() });
        })
      );
    }

    if (channelAllowed("messages", selected)) {
      let messagesUnsub: (() => void) | undefined;
      const wireMessages = () => {
        messagesUnsub?.();
        messagesUnsub = undefined;
        const ui = managed.ui;
        if (!ui) return;
        messagesUnsub = ui.on("messages", (payload) => {
          this.events.emit("messages", { channel: "messages", payload, ts: now() });
        });
      };
      wireMessages();
      unsubs.push(
        managed.on("ui", () => {
          wireMessages();
        })
      );
      unsubs.push(() => {
        messagesUnsub?.();
      });
    }

    if (channelAllowed("queues", selected)) {
      const chat = managed.getChatController();
      if (chat) {
        unsubs.push(
          chat.on("change", (payload) => {
            this.events.emit("queues", { channel: "queues", payload, ts: now() });
          })
        );
      }
    }

    if (channelAllowed("usage", selected)) {
      unsubs.push(
        managed.usage.on("change", (payload) => {
          this.events.emit("usage", { channel: "usage", payload, ts: now() });
        })
      );
    }

    if (channelAllowed("todos", selected)) {
      const todos = managed.todoManager;
      if (todos) {
        unsubs.push(
          todos.on("change", (items) => {
            this.events.emit("todos", {
              channel: "todos",
              payload: { items, title: todos.getTitle() },
              ts: now(),
            });
          })
        );
      }
    }

    if (channelAllowed("plan", selected)) {
      unsubs.push(
        managed.planMode.on("change", (payload) => {
          this.events.emit("plan", { channel: "plan", payload, ts: now() });
          // Agent mode is derived from plan phase (+ auto mode) — keep remote
          // snapshot.mode fresh when plan phase changes outside a dispatch
          // (e.g. plan auto-execution after seeding).
          if (channel === "plan") {
            this.events.emit("mode", {
              channel: "mode",
              payload: { mode: managed.getAgentMode(), autoMode: managed.isAutoModeEnabled() },
              ts: now(),
            });
          }
        })
      );
    }

    if (channelAllowed("tool", selected)) {
      unsubs.push(
        subscribeStreamingCallback(
          (chunk) => {
            this.events.emit("tool", { channel: "tool", payload: { kind: "chunk", chunk }, ts: now() });
          },
          { agentId: managed.id }
        )
      );
      unsubs.push(
        subscribeStreamingClearCallback(
          (toolCallId) => {
            this.events.emit("tool", { channel: "tool", payload: { kind: "clear", toolCallId }, ts: now() });
          },
          { agentId: managed.id }
        )
      );
    }

    if (channelAllowed("summary", selected) && managed.summaryStreams) {
      unsubs.push(
        managed.summaryStreams.subscribe((payload) => {
          this.events.emit("summary", { channel: "summary", payload, ts: now() });
        })
      );
    }

    // No `log` channel: log observability is provided exclusively by the
    // persisted JSONL file sink (.agents/logs/{sessionId}/agent.log).

    if (channelAllowed("extension-ui", selected)) {
      const ui = managed.extensionRunner?.getUI();
      if (ui) {
        unsubs.push(
          ui.subscribe<{ key: string; text: string }>("set-status", (data) => {
            this.events.emit("extension-ui", {
              channel: "extension-ui",
              payload: { type: "set-status", ...data },
              ts: now(),
            });
          }),
          ui.subscribe<{ message: string; level?: "success" | "info" | "error" }>("notify", (data) => {
            this.events.emit("extension-ui", {
              channel: "extension-ui",
              payload: { type: "notify", ...data },
              ts: now(),
            });
          }),
          ui.subscribe<{ id: string; component: string; props: Record<string, unknown> }>("set-widget", (data) => {
            this.events.emit("extension-ui", {
              channel: "extension-ui",
              payload: { type: "set-widget", ...data },
              ts: now(),
            });
          }),
          ui.subscribe<{ id: string; question: string }>("confirm", (data) => {
            this.events.emit("extension-ui", {
              channel: "extension-ui",
              payload: { type: "confirm", ...data },
              ts: now(),
            });
          })
        );
      }
    }

    if (channelAllowed("lifecycle", selected) && manager?.on) {
      const filter = new Set(this.lifecycleEvents);
      const on = manager.on.bind(manager);
      for (const type of this.lifecycleEvents) {
        unsubs.push(
          on(type, (event) => {
            if (!filter.has(event.type)) return;
            if (event.agentId === managed.id || (event.parentId === managed.id && event.type.startsWith("subagent:"))) {
              this.events.emit("lifecycle", { channel: "lifecycle", payload: event, ts: now() });
            }
          })
        );
      }
    }

    return () => {
      for (const unsub of unsubs) {
        try {
          unsub();
        } catch {
          // Ignore teardown errors
        }
      }
    };
  }

  async dispatch(command: AgentSessionCommand): Promise<AgentSessionCommandResult> {
    const result = await dispatchLocalAgentSessionCommand(this.managed, this.manager, command);
    if (result.ok) {
      // Post-command incremental events keep remote caches (RemoteSessionClient)
      // fresh for state that has no dedicated event source (extension list, MCP
      // servers, agent mode). Local sessions re-read getSnapshot() live, so this
      // is a no-op refresh there; over the wire it is the only path that updates
      // the cached snapshot fields.
      this.broadcastPostCommand(command);
    }
    return result;
  }

  /** Broadcast a protocol-level incremental event after a state-mutating command. */
  private broadcastPostCommand(command: AgentSessionCommand): void {
    const ts = now();
    let event: AgentSessionEvent | undefined;
    switch (command.type) {
      case "extension.toggle":
        event = {
          channel: "extensions",
          payload: { extensions: this.managed.extensionRunner?.getExtensionInfos() ?? [] },
          ts,
        };
        break;
      case "mcp.refresh":
        event = {
          channel: "mcp",
          payload: { servers: this.managed.getMcpManager()?.getServerStatuses() ?? [] },
          ts,
        };
        break;
      case "mode.set":
      case "mode.toggle":
        event = {
          channel: "mode",
          payload: { mode: this.managed.getAgentMode(), autoMode: this.managed.isAutoModeEnabled() },
          ts,
        };
        break;
      default:
        return;
    }
    this.events.emit(event.channel, event);
  }
}

/**
 * Create a Local AgentSession wrapping any ManagedAgent (root or subagent).
 */
export function createLocalAgentSession(options: CreateLocalAgentSessionOptions): AgentSession {
  return new LocalAgentSessionImpl(options);
}

/**
 * Open a child AgentSession by subagent id (same contract as the parent).
 */
export function sessionForSubagent(
  manager: LocalAgentSessionManager,
  subagentId: string,
  options?: Omit<CreateLocalAgentSessionOptions, "managed" | "manager">
): AgentSession | null {
  const child = manager.getAgent(subagentId);
  if (!child) return null;
  return createLocalAgentSession({ managed: child, manager, ...options });
}
