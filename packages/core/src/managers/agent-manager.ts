import { createAgentEventBus } from "../agent/agent-event-bus";
import { createSubagentTools } from "../agent/subagent/subagent-tools.js";
import { unregisterStreamingEventBus } from "../agent/tools/util/streaming-callback.js";
import { getEnv } from "../env.js";
import { ACTIVE_STATUSES } from "../runtime-types/agent-status.js";

import { buildManagedAgent } from "./agent-factory.js";
import { runManagedAgent, runManagedAgentStream, type RunAgentStreamInput } from "./run-agent.js";
import { emitSessionBootstrapEvents } from "./session-bootstrap-events.js";
import { bridgeTelemetryToAgentLog } from "./telemetry/event-log-bridge.js";

import type { ManagedAgent, ManagedAgentConfig } from "./managed-agent.js";
import type { AgentEvent, AgentEventListener, AgentEventBus, AgentEventType } from "../agent/agent-event-bus";
import type { ResumeResult, SessionData } from "../agent/persistence/types.js";
import type { ToolsRecord } from "../agent/tools/runtime/tools-record.js";
import type { StreamChunk } from "@tanstack/ai";

export type { AgentEvent, AgentEventListener, AgentEventBus, AgentEventType } from "../agent/agent-event-bus";
export type { ManagedAgent, ManagedAgentConfig } from "./managed-agent.js";
export type { RunAgentStreamInput } from "./run-agent.js";

// ============================================================================
// Types & Schemas
// ============================================================================

/** Environment variable for additional skill directories (comma-separated paths) */
export const SKILL_DIRS_ENV_VAR = "AGENT_SKILL_DIRS";

/**
 * Get default skill directories to load.
 *
 * Default load order (first loaded wins for duplicate skill names):
 * 1. Environment variable paths (AGENT_SKILL_DIRS, comma-separated)
 * 2. User home directory: ~/.agents/skills
 * 3. Current project directory: .agents/skills
 *
 * @returns Array of skill directory paths (absolute or relative)
 */
export async function getDefaultSkillDirs(): Promise<string[]> {
  const env = getEnv();
  const dirs: string[] = [];

  const runEnv = await env.getEnv();

  const envDirs = runEnv[SKILL_DIRS_ENV_VAR];
  if (envDirs) {
    const parsedDirs = envDirs
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    dirs.push(...parsedDirs);
  }

  const userSkillDir = env.path.join(await env.homedir(), ".agents", "skills");

  dirs.push(userSkillDir);

  dirs.push(".agents/skills");

  return dirs;
}

// ============================================================================
// AgentManager Class
// ============================================================================

export class AgentManager {
  /** Managed agents by ID */
  private agents: Map<string, ManagedAgent> = new Map();

  /**
   * Disk session ownership registry: maps a persisted session id to the live
   * agent id that currently holds (has resumed/owns) it. Because each root
   * agent owns an independent SessionStore, a second live agent would otherwise
   * resume the same disk session with no mutual exclusion. Live ownership is
   * intentionally process-local (not persisted) — a crashed process leaves no
   * stale owner, matching the "live exclusive" semantics.
   */
  private sessionOwners: Map<string, string> = new Map();

  /** Unified event bus root — single source for every agent event. */
  private readonly rootEventBus = createAgentEventBus();

  /** Process-wide observer bus (the unified root; events up-flow from agent scopes). */
  private readonly eventBus: AgentEventBus = this.rootEventBus;

  /** Per-agent scoped buses (cached by agent id). */
  private readonly agentBusScopes = new Map<string, AgentEventBus>();

  private readonly _detachEventLogBridge: () => void;

  constructor() {
    this._detachEventLogBridge = bridgeTelemetryToAgentLog(this.eventBus, (event) => {
      const managed = this.agents.get(event.agentId) ?? (event.parentId ? this.agents.get(event.parentId) : undefined);
      return managed?.log ?? null;
    });
  }

  // ============================================================================
  // Event Emitter
  // ============================================================================

  /**
   * Advanced: subscribe to the process-wide lifecycle bus (cross-agent / `"*"` telemetry).
   * For a single managed agent’s UI wiring, use AgentSession (`lifecycle` channel).
   *
   * @param type - Event type or `"*"` for all events
   * @param listener - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * // Process-wide telemetry
   * const unsubscribe = agentManager.on("*", (event) => {
   *   console.log(`Event: ${event.type}`, event.agentId);
   * });
   * unsubscribe();
   * ```
   */
  on(type: AgentEventType | "*", listener: AgentEventListener): () => void {
    return this.eventBus.on(type, listener);
  }

  /**
   * Scoped unified event bus for one agent. Subagents are scoped under their
   * parent, so their events up-flow to the parent and root observers.
   */
  of(agentId: string, parentId?: string): AgentEventBus {
    const cached = this.agentBusScopes.get(agentId);
    if (cached) return cached;
    const parent = parentId ? this.of(parentId) : this.rootEventBus;
    const bus = parent.scope(agentId);
    this.agentBusScopes.set(agentId, bus);
    return bus;
  }

  /**
   * Emit an agent event.
   * @internal Agent code should use `emitAgentTelemetry()` / `agent.emitEvent()` instead.
   */
  emit(event: AgentEvent): void {
    this.eventBus.emit(event.type, event.payload, {
      agentId: event.agentId,
      ...(event.parentId !== undefined ? { parentId: event.parentId } : {}),
      ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
    });
  }

  // ============================================================================
  // Agent Lifecycle
  // ============================================================================

  /**
   * Create a new agent
   */
  async createManagedAgent(config: ManagedAgentConfig, parentId?: string): Promise<ManagedAgent> {
    const { managed, bootstrap } = await buildManagedAgent({
      config,
      parentId,
      manager: this,
      emit: (event) => this.emit(event),
      getDefaultSkillDirs,
    });

    if (this.agents.has(managed.id)) {
      throw new Error(`Agent id already registered: ${managed.id}`);
    }

    this.agents.set(managed.id, managed);
    managed.manager = this;

    if (!parentId && bootstrap) {
      // Attach the JSONL log sink BEFORE bootstrap events so the session
      // timeline includes session:start/doc/skill/memory (persistence-only
      // log — pre-attach entries would be dropped).
      managed.ensureSessionData();
      managed.bindSessionLogSink();
    }

    if (bootstrap) {
      await emitSessionBootstrapEvents(managed, bootstrap);
    }

    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) {
        parent.childIds.push(managed.id);
        parent.updatedAt = Date.now();
      }
    }

    return managed;
  }

  /**
   * Spawn a subagent from a parent agent
   */
  async spawnSubagent(parentId: string, config: Partial<ManagedAgentConfig>): Promise<ManagedAgent> {
    const parent = this.agents.get(parentId);
    if (!parent) {
      throw new Error(`Parent agent not found: ${parentId}`);
    }
    const finalConfig = { ...parent.config, ...config };
    const subagent = await this.createManagedAgent(finalConfig, parentId);

    const customTools = (config as { subagentTools?: ToolsRecord | null }).subagentTools;
    if (customTools !== undefined) {
      subagent.tools = customTools ?? {};
    } else {
      subagent.tools = createSubagentTools(subagent);
    }
    subagent.invalidateRunner();

    // Subagents share the parent's session log directory but write an
    // independent file ({subagentId}.log) so per-agent entries stay attributable.
    const parentLogDir = parent.getLog()?.getFileSinkDir?.();
    if (parentLogDir) {
      subagent.getLog()?.attachFileSink({ dir: parentLogDir, filename: `${subagent.id}.log` });
    }

    return subagent;
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): ManagedAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all agents
   */
  getAgents(): ManagedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get root agents (agents without parent)
   */
  getRootAgents(): ManagedAgent[] {
    return this.getAgents().filter((a) => !a.parentId);
  }

  /**
   * Get subagents of a parent
   */
  getSubagents(parentId: string): ManagedAgent[] {
    const parent = this.agents.get(parentId);
    if (!parent) return [];
    return parent.childIds.map((id) => this.agents.get(id)).filter((a): a is ManagedAgent => a !== undefined);
  }

  /**
   * Recursively collect all *active* subagents under the given root agent.
   *
   * "Active" means the subagent's status indicates it is currently doing work
   * (running / thinking / responding / waiting / compacting). Subagents that
   * have already terminated (idle / completed / aborted / error) are skipped.
   *
   * Results are ordered deepest-first so that the most recently spawned
   * subagent is cancelled first (LIFO), matching the natural call stack.
   *
   * This is used by the app layer to implement layered cancellation:
   * when subagents are active, cancelling targets only the subagents
   * (one by one) and leaves the root agent's abort signal untouched.
   *
   * @param rootAgentId The root agent to search under
   * @returns Active subagents, deepest-first
   */
  getActiveSubagents(rootAgentId: string): ManagedAgent[] {
    return this._collectSubagents(rootAgentId, {
      filter: (managed) => managed.parentId != null && ACTIVE_STATUSES.has(managed.status),
    });
  }

  /**
   * Recursively collect all subagents (completed and active) under the given
   * root agent, ordered deepest-first.
   *
   * Unlike {@link getActiveSubagents}, this includes subagents that have
   * already terminated (completed, aborted, error, idle). This is useful for
   * the app layer's task panel, which should show the full history of all
   * subagent tasks in the current session.
   *
   * @param rootAgentId The root agent to search under
   * @returns All subagents, deepest-first
   */
  getAllSubagents(rootAgentId: string): ManagedAgent[] {
    return this._collectSubagents(rootAgentId, {
      filter: (managed) => managed.parentId != null,
    });
  }

  /**
   * Shared internal walker that recursively collects subagents under a root
   * agent, applying an optional filter predicate. Results are ordered
   * deepest-first (most recently spawned subagent first).
   */
  private _collectSubagents(
    rootAgentId: string,
    options?: { filter?: (managed: ManagedAgent) => boolean }
  ): ManagedAgent[] {
    const result: ManagedAgent[] = [];
    const seen = new Set<string>();
    const { filter } = options ?? {};

    const walk = (agentId: string) => {
      const managed = this.agents.get(agentId);
      if (!managed) return;
      // Recurse into children first (deepest-first ordering)
      for (const childId of [...managed.childIds].reverse()) {
        walk(childId);
      }
      // Include this node if it passes the filter (or no filter) and is not yet seen
      if ((!filter || filter(managed)) && !seen.has(managed.id)) {
        seen.add(managed.id);
        result.push(managed);
      }
    };

    walk(rootAgentId);
    return result;
  }

  /**
   * Destroy an agent and its subagents
   */
  destroyAgent(id: string): void {
    const managedAgent = this.agents.get(id);
    if (!managedAgent) return;

    unregisterStreamingEventBus(id);
    this.agentBusScopes.delete(id);

    // Release any disk-session ownership this agent held (root agents own one).
    const ownedSessionId = managedAgent.getSessionData?.()?.id;
    if (ownedSessionId) {
      this.releaseSessionOwnership(ownedSessionId, id);
    }

    // Force-kill MCP child processes synchronously to prevent orphans on exit
    managedAgent.mcpManager?.forceKill();

    managedAgent.abort("Agent destroyed");

    // Destroy all subagents first
    for (const childId of [...managedAgent.childIds]) {
      this.destroyAgent(childId);
    }

    // Remove from parent's childIds
    if (managedAgent.parentId) {
      const parent = this.agents.get(managedAgent.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((cid) => cid !== id);
        parent.updatedAt = Date.now();
      }
      managedAgent.emitEvent("subagent:destroyed", { subagentId: id }, { parentId: managedAgent.parentId });
    }

    // Teardown extensions: emit interceptable session:shutdown first (so extensions can
    // release resources, e.g. kill LSP daemons), then deactivate/destroy all extensions.
    // This fixes a pre-existing leak where extensionRunner.destroyAll() was never called.
    const runner = managedAgent.extensionRunner;
    if (runner) {
      runner.emitSessionShutdown(id);
      void runner.destroyAll();
    }

    this.agents.delete(id);
  }

  /**
   * Acquire exclusive ownership of a persisted disk session for a live agent.
   * Returns `false` (and leaves ownership unchanged) when the session is already
   * held by a *different* live agent. Idempotent for the same agent.
   */
  acquireSessionOwnership(sessionId: string, agentId: string): boolean {
    const owner = this.sessionOwners.get(sessionId);
    if (owner !== undefined && owner !== agentId) {
      return false;
    }
    this.sessionOwners.set(sessionId, agentId);
    return true;
  }

  /**
   * Release a disk session's ownership if it was held by the given agent.
   * No-op when the session is owned by another agent or unknown.
   */
  releaseSessionOwnership(sessionId: string, agentId: string): void {
    if (this.sessionOwners.get(sessionId) === agentId) {
      this.sessionOwners.delete(sessionId);
    }
  }

  /**
   * Resume a session by ID. Restores uiMessages, usage, and todos.
   * Returns UIMessages for the client to display.
   */
  async resumeSession(agentId: string, sessionId: string): Promise<ResumeResult> {
    const managed = this.agents.get(agentId);
    if (!managed) throw new Error(`Agent not found: ${agentId}`);

    const session = await managed.restoreSession(sessionId);

    return {
      uiMessages: session.uiMessages,
      session: {
        id: session.id,
        name: session.name,
        version: session.version,
        modelStyle: session.modelStyle,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    };
  }

  /**
   * Continue the most recent session. Returns null if no sessions exist.
   */
  async continueLatestSession(agentId: string): Promise<ResumeResult | null> {
    const managed = this.agents.get(agentId);
    if (!managed) throw new Error(`Agent not found: ${agentId}`);

    const store = managed.getSessionStore();
    if (!store) throw new Error("Session store not available");

    const latest = await store.getLatest();
    if (!latest) return null;

    return this.resumeSession(agentId, latest.id);
  }

  /**
   * List all sessions for a given agent's session store.
   */
  async listSessions(agentId: string): Promise<SessionData[]> {
    const managed = this.agents.get(agentId);
    if (!managed) throw new Error(`Agent not found: ${agentId}`);

    const store = managed.getSessionStore();
    if (!store) return [];

    return (await store.list()) as unknown as SessionData[];
  }

  /**
   * Run an agent via TanStack `AgentRunner` and yield AG-UI chunks in-process.
   * Updates {@link ManagedAgent.status} and {@link ManagedAgent.usage} via lifecycle middleware.
   */
  runAgentStream(agentId: string, input: RunAgentStreamInput): AsyncIterable<StreamChunk> {
    return runManagedAgentStream(this, agentId, input);
  }

  /**
   * Run an agent via TanStack `AgentRunner`.
   * Returns AG-UI stream chunks. UI consume / outcome finalization use `runAgentOnce`.
   */
  runAgent(agentId: string, input: RunAgentStreamInput): Promise<AsyncIterable<StreamChunk>> {
    return runManagedAgent(this, agentId, input);
  }

  /**
   * Destroy all agents
   */
  reset(): void {
    // Destroy root agents (which will cascade to subagents)
    for (const agent of this.getRootAgents()) {
      this.destroyAgent(agent.id);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default singleton instance for global use
 */
export const agentManager = new AgentManager();
