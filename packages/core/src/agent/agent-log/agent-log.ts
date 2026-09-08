import { getEnv } from "../../env.js";
import { createSequentialIdGenerator } from "../../utils/generate-id.js";

import type { AgentLogFileSinkOptions, LogCategory, LogEntry, LogLevel } from "./types.js";

// ============================================================================
// Log ID Generator
// ============================================================================

export const generateLogId = createSequentialIdGenerator("log");

// ============================================================================
// AgentLog Class
// ============================================================================

/**
 * AgentLog - persistence-only event timeline for agent operations.
 *
 * Every accepted entry is serialized and streamed straight to the attached
 * file sink (JSONL, one entry per line). There is no in-memory history: the
 * log file is the single source of log observability.
 *
 * Features:
 * 1. **Structured entries** - LogEntry with level, category, data, error, run id
 * 2. **Run scoping** - entries logged during an agent run share one `run` id
 * 3. **Disk persistence** - JSONL file sink with size-based rotation
 */
export class AgentLog {
  private enabled = true;
  private minLevel: LogLevel = "debug";

  /** Short run id stamped onto entries while an agent run is in flight. */
  private currentRun: string | null = null;

  /** Active file sink's per-entry consumer, or null when no sink is attached. */
  private sinkEntry: ((entry: LogEntry) => void) | null = null;

  private static readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(options?: { enabled?: boolean; minLevel?: LogLevel }) {
    if (options?.enabled !== undefined) this.enabled = options.enabled;
    if (options?.minLevel) this.minLevel = options.minLevel;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Set the active run id: entries logged while set are stamped with `run`.
   * Pass `null` to leave run scope (bootstrap/idle entries carry no `run`).
   */
  setRun(run: string | null): void {
    this.currentRun = run;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    return AgentLog.levelPriority[level] >= AgentLog.levelPriority[this.minLevel];
  }

  // ============================================================================
  // Logging Methods
  // ============================================================================

  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    options?: {
      data?: Record<string, unknown>;
      error?: Error;
      tags?: string[];
    }
  ): LogEntry | null {
    if (!this.shouldLog(level)) return null;

    const entry: LogEntry = {
      id: generateLogId(),
      timestamp: Date.now(),
      level,
      category,
      message,
    };

    if (options?.data) entry.data = options.data;
    if (options?.tags) entry.tags = options.tags;
    if (this.currentRun) entry.run = this.currentRun;
    if (options?.error) {
      entry.error = {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack,
      };
    }

    // Persistence-only: hand the entry to the attached sink (if any) and drop it.
    this.sinkEntry?.(entry);

    return entry;
  }

  debug(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("debug", category, message, { data, tags });
  }

  info(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("info", category, message, { data, tags });
  }

  warn(category: LogCategory, message: string, data?: Record<string, unknown>, tags?: string[]): LogEntry | null {
    return this.log("warn", category, message, { data, tags });
  }

  error(
    category: LogCategory,
    message: string,
    error?: Error,
    data?: Record<string, unknown>,
    tags?: string[]
  ): LogEntry | null {
    return this.log("error", category, message, { data, error, tags });
  }

  // ============================================================================
  // File Sink (disk persistence)
  // ============================================================================

  private fileSinkDir: string | null = null;

  /** Directory the active file sink writes to, or null when none is attached. */
  getFileSinkDir(): string | null {
    return this.fileSinkDir;
  }

  /**
   * Persist log entries to a JSONL file (one LogEntry per line) with size-based
   * rotation. Silent no-op when the env fs lacks `appendFile`. Entries logged
   * before attach are not retained — attach at session creation, before the
   * first log call. Returns an unsubscribe function.
   */
  attachFileSink(options: AgentLogFileSinkOptions): () => void {
    let fs: ReturnType<typeof getEnv>["fs"];
    try {
      fs = getEnv().fs;
    } catch {
      return () => {}; // CoreEnv not registered — degrade silently
    }
    if (!fs.appendFile) return () => {}; // no append support — degrade silently

    const appendFile = fs.appendFile;
    if (!appendFile) return () => {};
    const dir = options.dir;
    const filename = options.filename ?? "agent.log";
    const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    const maxFiles = options.maxFiles ?? 5;
    const flushIntervalMs = options.flushIntervalMs ?? 250;
    const filePath = `${dir}/${filename}`;

    let buffer: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    /**
     * Whether the session-boundary marker has been written. When the sink is
     * attached to an existing file (same session reused across launches), the
     * first flush prepends a visible divider so the new launch's log lines do
     * not blend into the previous one's.
     */
    let boundaryWritten = false;

    /** Shift segments `{file}.{maxFiles-1}` → drop, ..., `{file}` → `{file}.1`, then truncate. */
    const rotate = async (): Promise<void> => {
      const oldest = `${filePath}.${maxFiles - 1}`;
      if (await fs.exists(oldest)) await fs.remove(oldest);
      for (let i = maxFiles - 2; i >= 1; i--) {
        const from = `${filePath}.${i}`;
        const to = `${filePath}.${i + 1}`;
        if (await fs.exists(from)) {
          const content = await fs.readFile(from);
          await fs.writeFile(to, content);
          await fs.remove(from);
        }
      }
      if (await fs.exists(filePath)) {
        const content = await fs.readFile(filePath);
        await fs.writeFile(`${filePath}.1`, content);
      }
      await fs.writeFile(filePath, "");
    };

    const flush = async (): Promise<void> => {
      if (buffer.length === 0) return;
      const lines = buffer;
      buffer = [];
      try {
        await fs.mkdir(dir);
        const existed = await fs.exists(filePath);
        if (!existed) {
          await fs.writeFile(filePath, "");
        }
        // Reused log file (session resumed/continued): mark the new launch with
        // a clearly visible divider before the first batch of this session.
        if (!boundaryWritten) {
          boundaryWritten = true;
          if (existed) {
            lines.unshift(`---------- ${new Date().toISOString()} new session ----------`);
          }
        }
        const content = lines.join("\n") + "\n";
        const contentBytes = new TextEncoder().encode(content).length;
        // Rotate when the active file already meets maxBytes, or when the pending
        // batch would push it past the limit — so a large batch never leaves the
        // active file over budget. Size comes from stat (restart-safe).
        let currentBytes = 0;
        try {
          currentBytes = (await fs.stat(filePath)).size;
        } catch {
          currentBytes = 0;
        }
        if (currentBytes > 0 && currentBytes + contentBytes >= maxBytes) {
          await rotate();
        }
        await appendFile(filePath, content);
      } catch {
        // Non-fatal: log persistence must never break agent execution.
      }
    };

    const schedule = (): void => {
      if (timer || disposed) return;
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, flushIntervalMs);
    };

    const handleEntry = (entry: LogEntry): void => {
      buffer.push(JSON.stringify(entry));
      schedule();
    };

    // Replace any previous sink (one active sink per log).
    this.sinkEntry = handleEntry;
    this.fileSinkDir = dir;

    return () => {
      disposed = true;
      if (this.sinkEntry === handleEntry) {
        this.sinkEntry = null;
        this.fileSinkDir = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void flush(); // best-effort final flush
    };
  }
}
