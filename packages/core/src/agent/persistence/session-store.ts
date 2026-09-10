/**
 * SessionStore - Journal + snapshot session persistence.
 *
 * Stores each session as an append-only JSONL journal
 * `.agents/sessions/{id}.session.log` (source of truth) plus a materialized
 * snapshot `.agents/sessions/{id}.session.json` (cache). save() appends a
 * durable whole-state checkpoint first, then writes the snapshot, then
 * truncates the journal to records newer than the snapshot — a crash between
 * append and snapshot is recovered on load by replaying the journal tail.
 *
 * Binary assets (images, audio, PDFs) are extracted from inline base64 and
 * stored as content-addressed files under `.agents/media/<hash>.<ext>`. The
 * session JSON stores only `media://<hash>` references in `source.value` and
 * a `MediaRef` in `metadata.mediaRef`. Hydrate/Dehydrate happens in
 * SessionService via `media-utils.ts`.
 */

import { getEnv } from "../../env.js";
import { generateId } from "../../utils/generate-id.js";

import { appendCheckpoint, lastRecord, readJournal, truncateAfter } from "./session-journal.js";
import { SESSION_DIR, SESSION_FILE_SUFFIX, SESSION_LOG_SUFFIX, SESSION_VERSION } from "./types.js";

import type { SessionData, SessionMeta } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default empty token usage */
const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/**
 * How long a startup-reused empty session stays reserved before another
 * process may select it again. Cross-process live ownership is not shared, so
 * the reservation is the only cross-process signal; the window must cover
 * "launch two terminals back-to-back" while still releasing itself after a
 * crash (no stale locks to clean up).
 */
const EMPTY_SESSION_RESERVE_MS = 5 * 60_000;

// ============================================================================
// SessionStore Class
// ============================================================================

export class SessionStore {
  /**
   * Hash of the last saved JSON string per session.
   * Used to skip writes when nothing changed.
   */
  private lastSavedHash: Map<string, string> = new Map();

  /**
   * Per-session write lock to prevent concurrent saves from racing.
   */
  private saveLocks: Map<string, Promise<void>> = new Map();

  private get fs() {
    return getEnv().fs;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Create a new empty session and return its SessionData.
   * Does NOT write to disk — the first call to save() writes the file.
   */
  create(options: { modelStyle: string; model: string; name?: string }): SessionData {
    const id = generateId("ses");
    const now = Date.now();

    return {
      id,
      name: options.name || "New Session",
      version: SESSION_VERSION,
      modelStyle: options.modelStyle === "anthropic" ? "anthropic" : "openai",
      model: options.model,
      uiMessages: [],
      usage: { ...EMPTY_USAGE },
      todos: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Save a session: append a durable whole-state checkpoint to the journal
   * (source of truth), then write the snapshot (cache), then truncate the
   * journal to records newer than the snapshot. Skips both when the content
   * hasn't changed since the last save. Serializes concurrent saves per
   * session to prevent race conditions.
   */
  async save(session: SessionData): Promise<void> {
    const prev = this.saveLocks.get(session.id) ?? Promise.resolve();
    // Run doSave after the previous lock; return the rejecting promise to callers
    // so failures surface (session:save-error). Keep the stored lock chain
    // non-rejecting so one failure does not permanently stall later saves.
    const run = prev.then(() => this.doSave(session));
    this.saveLocks.set(
      session.id,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }

  /**
   * Load a full session by ID: read the snapshot, then replay any journal
   * record newer than the snapshot (crash between append and snapshot, or a
   * corrupt/missing snapshot with a valid journal). v4 snapshot-only files
   * load unchanged.
   */
  async load(id: string): Promise<SessionData | null> {
    const filePath = this.getFilePath(id);
    const snapshot = await this.tryLoadJson(filePath);

    const logPath = this.getLogPath(id);
    const journal = (await this.fs.exists(logPath)) ? await readJournal(this.fs, logPath) : [];
    const latest = lastRecord(journal);

    // The journal is canonical when it is ahead of the snapshot.
    if (latest && (!snapshot || latest.seq > (snapshot.journalSeq ?? 0))) {
      const session = latest.data as SessionData;
      if (session.id !== id && id.startsWith("ses_")) {
        session.id = id;
      }
      return session;
    }

    if (!snapshot) return null;

    if (snapshot.id !== id && id.startsWith("ses_")) {
      snapshot.id = id;
    }
    return snapshot;
  }

  /**
   * List all sessions (metadata only, sorted by updatedAt descending).
   */
  async list(): Promise<SessionMeta[]> {
    const dirExists = await this.fs.exists(SESSION_DIR);
    if (!dirExists) return [];

    const entries = await this.fs.readdir(SESSION_DIR);
    const sessions: SessionMeta[] = [];

    for (const entry of entries) {
      if (entry.type !== "file" || !entry.name.endsWith(SESSION_FILE_SUFFIX)) continue;

      const id = entry.name.slice(0, -SESSION_FILE_SUFFIX.length);

      try {
        const data = await this.tryLoadJson(`${SESSION_DIR}/${entry.name}`);
        if (!data) continue;

        sessions.push({
          id: data.id || id,
          name: data.name,
          version: data.version,
          modelStyle: data.modelStyle,
          model: data.model,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } catch {
        // Skip corrupted files
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get the most recently updated session.
   */
  async getLatest(): Promise<SessionData | null> {
    const metas = await this.list();
    if (metas.length === 0) return null;
    return this.load(metas[0].id);
  }

  /**
   * Find the most recently updated session that has never been used (contains
   * no user messages) and is not currently reserved by a concurrent live agent.
   * Lets hosts reuse the leftover empty session from a previous startup instead
   * of creating a fresh one, without racing another process onto the same id.
   */
  async getLatestEmpty(): Promise<SessionData | null> {
    const metas = await this.list();
    const now = Date.now();
    for (const meta of metas) {
      const data = await this.load(meta.id);
      if (!data || data.uiMessages.some((m) => m.role === "user")) continue;
      if (data.reservedAt && now - data.reservedAt < EMPTY_SESSION_RESERVE_MS) continue;
      return data;
    }
    return null;
  }

  /**
   * Mark a still-empty session as taken by this live agent so a second
   * process/agent does not select the same id during startup reuse. The mark
   * persists to disk and expires after {@link EMPTY_SESSION_RESERVE_MS},
   * self-healing if the reserving process crashes. No-op when the session is
   * no longer empty (then it is simply never selected again).
   */
  async reserveSession(id: string): Promise<void> {
    const session = await this.load(id);
    if (!session || session.uiMessages.some((m) => m.role === "user")) return;
    session.reservedAt = Date.now();
    await this.save(session);
  }

  /**
   * Clear a still-empty session's startup reservation so a later launch can
   * reuse it again. Called on graceful agent teardown; a crash instead leaves
   * the reservation to expire on its own ({@link EMPTY_SESSION_RESERVE_MS}).
   * No-op when the session is no longer empty (it is never selected again) or
   * was never reserved.
   */
  async releaseReservation(id: string): Promise<void> {
    const session = await this.load(id);
    if (!session || session.uiMessages.some((m) => m.role === "user")) return;
    if (session.reservedAt === undefined) return;
    delete session.reservedAt;
    await this.save(session);
  }

  /**
   * Find sessions by name (partial match, case-insensitive).
   */
  async findByName(query: string): Promise<SessionMeta[]> {
    const all = await this.list();
    const lower = query.toLowerCase();
    return all.filter((s) => s.name.toLowerCase().includes(lower));
  }

  /**
   * Delete a session by ID.
   */
  async delete(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    if (await this.fs.exists(filePath)) {
      await this.fs.remove(filePath);
      const logPath = this.getLogPath(id);
      if (await this.fs.exists(logPath)) {
        await this.fs.remove(logPath);
      }
      this.lastSavedHash.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Update session name.
   */
  async rename(id: string, name: string): Promise<void> {
    const session = await this.load(id);
    if (!session) return;
    session.name = name;
    await this.save(session);
  }

  /**
   * Clear in-memory cache for a session.
   */
  clearCache(id: string): void {
    this.lastSavedHash.delete(id);
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async doSave(session: SessionData): Promise<void> {
    await this.ensureDir();

    session.updatedAt = Date.now();

    const json = JSON.stringify(session);

    // Skip write if content is identical to last save
    const lastHash = this.lastSavedHash.get(session.id);
    if (lastHash === json) return;

    const filePath = this.getFilePath(session.id);

    // 1. Durable append to the journal (source of truth) before the snapshot.
    //    A crash between this and the snapshot write is recovered on load by
    //    replaying the journal tail.
    session.journalSeq = (session.journalSeq ?? 0) + 1;
    const appended = await appendCheckpoint(this.fs, this.getLogPath(session.id), session.journalSeq, session);

    // 2. Snapshot (materialized cache) captures the PREVIOUS durable state, so
    //    the journal's newest checkpoint stays strictly ahead of it and is the
    //    load-time source of truth. On the first save the snapshot seq is 0.
    const snapshotSeq = session.journalSeq - 1;
    const snapshot = { ...session, journalSeq: snapshotSeq };
    const snapshotJson = JSON.stringify(snapshot);
    await this.fs.writeFile(filePath, snapshotJson);
    // Hash the live session (which carries the current journalSeq) so a no-op
    // save is detected even though the on-disk snapshot lags one seq behind.
    this.lastSavedHash.set(session.id, JSON.stringify(session));

    // 3. Bound the journal to records newer than the snapshot seq.
    if (appended) {
      await truncateAfter(this.fs, this.getLogPath(session.id), snapshotSeq);
    }
  }

  private async tryLoadJson(filePath: string): Promise<SessionData | null> {
    if (!(await this.fs.exists(filePath))) return null;
    try {
      const content = await this.fs.readFile(filePath);
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  }

  private getFilePath(id: string): string {
    return `${SESSION_DIR}/${id}${SESSION_FILE_SUFFIX}`;
  }

  private getLogPath(id: string): string {
    return `${SESSION_DIR}/${id}${SESSION_LOG_SUFFIX}`;
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.fs.exists(SESSION_DIR))) {
      await this.fs.mkdir(SESSION_DIR);
    }
  }
}
