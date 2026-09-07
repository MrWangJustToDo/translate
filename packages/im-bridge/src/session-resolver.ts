/**
 * Session resolver — maps `platform:chatId:threadId` onto AgentSession ids.
 *
 * The mapping is journaled to `<dataDir>/sessions.json` so a bridge restart can
 * reconnect via `host.connect(agentId)` instead of spawning fresh sessions.
 * Stale mappings (agent gone after a server restart) are detected via dispatch
 * failures and healed by the runtime, which resets and recreates the session.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { BridgeConfig } from "./config.js";
import type { ChatTarget } from "./types.js";
import type { AgentSession, AgentSessionHost } from "@my-agent/core";

export interface SessionEntry {
  key: string;
  agentId: string;
  createdBy: string;
  lastActiveAt: number;
}

interface SessionJournal {
  version: 1;
  sessions: SessionEntry[];
}

export interface ResolvedSession {
  session: AgentSession;
  entry: SessionEntry;
  /** True when a brand-new agent session was created for this chat. */
  created: boolean;
}

export function sessionKeyOf(platform: string, target: ChatTarget): string {
  return `${platform}:${target.chatId}:${target.threadId ?? ""}`;
}

export class SessionResolver {
  private readonly entries = new Map<string, SessionEntry>();
  private readonly live = new Map<string, AgentSession>();
  private readonly journalPath: string;
  private saveChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly host: AgentSessionHost,
    private readonly config: BridgeConfig
  ) {
    this.journalPath = join(config.dataDir, "sessions.json");
  }

  /** Load the persisted mapping. Missing or corrupt journals start empty. */
  async init(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.journalPath, "utf8");
    } catch {
      return;
    }
    try {
      const journal = JSON.parse(raw) as SessionJournal;
      if (journal.version !== 1 || !Array.isArray(journal.sessions)) return;
      for (const entry of journal.sessions) {
        if (typeof entry.key === "string" && typeof entry.agentId === "string") {
          this.entries.set(entry.key, entry);
        }
      }
    } catch {
      // Corrupt journal — start empty; the runtime heals stale sessions on demand.
    }
  }

  async getOrCreate(platform: string, target: ChatTarget, userId: string): Promise<ResolvedSession> {
    const key = sessionKeyOf(platform, target);
    const existing = this.entries.get(key);
    if (existing) {
      const session = this.connect(existing.agentId);
      if (session) {
        existing.lastActiveAt = Date.now();
        this.queueSave();
        return { session, entry: existing, created: false };
      }
      this.entries.delete(key); // dead mapping (e.g. local host lost the agent) — fall through to create
    }
    return this.create(platform, target, userId);
  }

  async create(platform: string, target: ChatTarget, userId: string): Promise<ResolvedSession> {
    const key = sessionKeyOf(platform, target);
    // Explicit client model wins at the server; otherwise the server resolves
    // the model from its own `.env` (agent-session.ts — body.model is optional).
    const { session } = await this.host.create({
      name: `${this.config.sessionNamePrefix}:${key}`,
      // Empty model string ⇒ the server falls back to its own `.env` provider.
      model: this.config.model ?? "",
    });
    const entry: SessionEntry = { key, agentId: session.id, createdBy: userId, lastActiveAt: Date.now() };
    this.entries.set(key, entry);
    this.live.set(session.id, session);
    this.queueSave();
    return { session, entry, created: true };
  }

  /** Drop the mapping for a chat and destroy the agent (best effort). Used by the `/new` command. */
  async reset(platform: string, target: ChatTarget): Promise<void> {
    const key = sessionKeyOf(platform, target);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    const session = this.live.get(entry.agentId);
    this.live.delete(entry.agentId);
    this.queueSave();
    try {
      await session?.close?.();
    } catch {
      // ignore close failures
    }
    try {
      await this.host.destroy(entry.agentId);
    } catch {
      // ignore destroy failures (e.g. agent already gone server-side)
    }
  }

  /** Drop a mapping without destroying the agent — heals `not_found` dispatch results. */
  invalidate(platform: string, target: ChatTarget): void {
    const key = sessionKeyOf(platform, target);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.live.delete(entry.agentId);
    this.queueSave();
  }

  listEntries(): SessionEntry[] {
    return [...this.entries.values()];
  }

  private connect(agentId: string): AgentSession | null {
    const cached = this.live.get(agentId);
    if (cached) return cached;
    const session = this.host.connect(agentId);
    if (session) this.live.set(agentId, session);
    return session;
  }

  private queueSave(): void {
    this.saveChain = this.saveChain
      .then(() => this.saveNow())
      .catch(() => {
        // Journal failures must never break the bridge; the next mutation retries.
      });
  }

  private async saveNow(): Promise<void> {
    const journal: SessionJournal = { version: 1, sessions: this.listEntries() };
    await mkdir(dirname(this.journalPath), { recursive: true });
    await writeFile(this.journalPath, JSON.stringify(journal, null, 2), "utf8");
  }
}
