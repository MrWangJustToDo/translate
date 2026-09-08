/**
 * Local AgentSessionHost — wraps AgentManager + LocalAgentSession.
 *
 * Bootstrap resume (`continueSession` / `resumeSessionId` on create) calls the same
 * {@link ManagedAgent.restoreSession} path as Session command `session.resume`.
 * Mid-session switches should use `session.dispatch({ type: "session.resume", ... })`.
 */

import { createLocalAgentSession } from "./local-agent-session.js";

import type {
  AgentSessionCreateOptions,
  AgentSessionCreateResult,
  AgentSessionHost,
  AgentSessionListEntry,
} from "./host-types.js";
import type { LocalAgentSessionManager } from "./local-agent-session.js";
import type { AgentSession } from "./types.js";
import type { AgentManager } from "../managers/agent-manager.js";
import type { ManagedAgent, ManagedAgentConfig } from "../managers/managed-agent.js";
import type { UIMessage } from "@tanstack/ai";

/** Minimal manager surface required by the Local Host (AgentManager satisfies this). */
export interface LocalAgentSessionHostManager extends LocalAgentSessionManager {
  createManagedAgent(config: ManagedAgentConfig, parentId?: string): Promise<ManagedAgent>;
  getAgents(): ManagedAgent[];
  destroyAgent(id: string): void;
}

export interface CreateLocalAgentSessionHostOptions {
  manager: LocalAgentSessionHostManager;
}

function toListEntry(managed: ManagedAgent): AgentSessionListEntry {
  return {
    agentId: managed.id,
    name: managed.name,
    ...(managed.parentId ? { parentId: managed.parentId } : {}),
    status: managed.status,
    ...(managed.getSessionData?.()?.id ? { sessionId: managed.getSessionData()!.id } : {}),
    createdAt: managed.createdAt,
    updatedAt: managed.updatedAt,
  };
}

function toManagedConfig(options: AgentSessionCreateOptions): ManagedAgentConfig {
  return {
    name: options.name,
    model: options.model,
    maxIterations: options.maxIterations ?? 100,
    ...(options.modelStyle ? { modelStyle: options.modelStyle } : {}),
    ...(options.modelBaseURL ? { modelBaseURL: options.modelBaseURL } : {}),
    ...(options.modelApiKey ? { modelApiKey: options.modelApiKey } : {}),
    ...(options.modelInfo ? { modelInfo: options.modelInfo } : {}),
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    ...(options.mcpConfigPath ? { mcpConfigPath: options.mcpConfigPath } : {}),
    ...(options.extensionDirs?.length ? { extensionDirs: options.extensionDirs } : {}),
    ...(options.toolConfig ? { toolConfig: options.toolConfig } : {}),
  };
}

/**
 * Bootstrap-time disk restore. Same `restoreSession` path as `session.resume`
 * (queues cleared + approval/ask_user reconciled inside restore).
 * `initChat` still runs after restore because the chat controller does not exist yet.
 */
async function restoreInitialMessages(
  managed: ManagedAgent,
  options: AgentSessionCreateOptions
): Promise<UIMessage[] | undefined> {
  if (options.resumeSessionId) {
    const data = await managed.restoreSession(options.resumeSessionId);
    return data.uiMessages;
  }
  if (!options.continueSession) {
    // Default startup: reuse the most recently updated *empty* session (no user
    // messages) instead of creating a new one every launch — avoids piling up
    // empty session files. Sessions with real history are only resumed via an
    // explicit `--continue` / `--resume`.
    const store = managed.getSessionStore?.() ?? null;
    if (store) {
      const empty = await store.getLatestEmpty();
      if (empty) {
        // Reserve the id on disk BEFORE restoring so a second process/agent
        // starting concurrently (cross-process ownership is not shared) skips
        // it and picks a different empty session or creates a fresh one.
        await store.reserveSession(empty.id);
        const data = await managed.restoreSession(empty.id);
        return data.uiMessages;
      }
    }
    return undefined;
  }

  const store = managed.getSessionStore?.() ?? null;
  if (!store) return undefined;
  const latest = await store.getLatest();
  if (!latest) return undefined;
  const data = await managed.restoreSession(latest.id);
  return data.uiMessages;
}

class LocalAgentSessionHostImpl implements AgentSessionHost {
  private readonly manager: LocalAgentSessionHostManager;
  private readonly sessions = new Map<string, AgentSession>();

  constructor(options: CreateLocalAgentSessionHostOptions) {
    this.manager = options.manager;
  }

  async create(options: AgentSessionCreateOptions): Promise<AgentSessionCreateResult> {
    const managed = await this.manager.createManagedAgent(toManagedConfig(options));
    const initialMessages = await restoreInitialMessages(managed, options);
    const initial = initialMessages ?? [];

    // Fix the session id before the first persist (in-memory only; no disk
    // write until the first save()). The JSONL log sink is attached by the
    // manager before bootstrap events fire, so the timeline includes them.
    managed.ensureSessionData();

    // Chat controller stays behind Session; adapters must not call ManagedAgent.initChat.
    managed.initChat(this.manager as AgentManager, initial);
    managed.syncInteractionStateFromUIMessages(initial);

    const session = createLocalAgentSession({
      managed,
      manager: this.manager,
    });
    this.sessions.set(session.id, session);

    return { session, ...(initial.length ? { initialMessages: initial } : {}) };
  }

  connect(agentId: string): AgentSession | null {
    const cached = this.sessions.get(agentId);
    if (cached) return cached;
    const managed = this.manager.getAgent(agentId);
    if (!managed) return null;
    const session = createLocalAgentSession({
      managed,
      manager: this.manager,
    });
    this.sessions.set(agentId, session);
    return session;
  }

  list(): AgentSessionListEntry[] {
    return this.manager.getAgents().map(toListEntry);
  }

  async destroy(agentId: string): Promise<void> {
    // Cascade: drop cached sessions for the agent and any children (the manager
    // already removes them from its registry). Child sessions expose their
    // parent via snapshot.parentId.
    for (const [id, entry] of [...this.sessions.entries()]) {
      const parentId = entry.getSnapshot().parentId;
      if (id === agentId || parentId === agentId) {
        this.sessions.delete(id);
      }
    }
    this.manager.destroyAgent(agentId);
  }
}

/**
 * Create an in-process AgentSessionHost backed by an AgentManager (or test double).
 */
export function createLocalAgentSessionHost(options: CreateLocalAgentSessionHostOptions): AgentSessionHost {
  return new LocalAgentSessionHostImpl(options);
}
