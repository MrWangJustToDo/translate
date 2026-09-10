/**
 * Per-agent multi-key summary stream hub (task + compact).
 */

import { applySummaryStreamAppend, emptySummaryLineBuffer, SUMMARY_STREAM_SNAPSHOT_LINE_CAP } from "./line-buffer.js";
import {
  summaryStreamKey,
  type SummaryStreamEvent,
  type SummaryStreamSnapshot,
  type SummaryStreamSource,
} from "./types.js";

import type { AgentEventBus } from "../agent-event-bus";

interface StreamEntry {
  source: SummaryStreamSource;
  toolCallId?: string;
  compactId?: string;
  label?: string;
  epoch?: string;
  seq: number;
  lines: string[];
  pendingLine: string;
  status: SummaryStreamSnapshot["status"];
}

export interface SummaryStreamResetInput {
  source: SummaryStreamSource;
  /** Required for source=task. */
  toolCallId?: string;
  /** Required for source=compact. */
  compactId?: string;
  /** Optional phase label shown by UI consumers (e.g. multi-pass compaction). */
  label?: string;
  /** Compaction run identity — same-epoch resets become appends upstream. */
  epoch?: string;
}

function resolveId(input: SummaryStreamResetInput): string {
  if (input.source === "task") {
    if (!input.toolCallId) throw new Error("summary stream reset(task) requires toolCallId");
    return input.toolCallId;
  }
  if (!input.compactId) throw new Error("summary stream reset(compact) requires compactId");
  return input.compactId;
}

/**
 * Owns summary stream state for one ManagedAgent and multicasts events to listeners.
 */
export class SummaryStreamHub {
  private readonly streams = new Map<string, StreamEntry>();

  /** Unified event bus for the owning agent (session `summary` projection). */
  private eventBus?: AgentEventBus;

  /** @internal Attach the agent's scoped unified event bus. */
  setEventBus(bus: AgentEventBus): void {
    this.eventBus = bus;
  }

  getSnapshot(key: string): SummaryStreamSnapshot | null {
    const entry = this.streams.get(key);
    if (!entry) return null;
    return this.toSnapshot(key, entry);
  }

  listSnapshots(): SummaryStreamSnapshot[] {
    return [...this.streams.entries()].map(([key, entry]) => this.toSnapshot(key, entry));
  }

  reset(input: SummaryStreamResetInput): SummaryStreamSnapshot {
    const id = resolveId(input);
    const key = summaryStreamKey(input.source, id);
    const entry: StreamEntry = {
      source: input.source,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.compactId ? { compactId: input.compactId } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.epoch ? { epoch: input.epoch } : {}),
      seq: 1,
      ...emptySummaryLineBuffer(),
      status: "active",
    };
    this.streams.set(key, entry);
    this.emit({
      type: "reset",
      key,
      source: input.source,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.compactId ? { compactId: input.compactId } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.epoch ? { epoch: input.epoch } : {}),
      seq: entry.seq,
    });
    return this.toSnapshot(key, entry);
  }

  append(key: string, chunk: string, options?: { epoch?: string }): void {
    if (!chunk) return;
    const entry = this.streams.get(key);
    if (!entry || entry.status === "idle") return;
    if (entry.status === "ended") {
      // Late chunks after end are ignored — unless the append belongs to the
      // same compaction epoch, which reopens the ended stream (follow-up pass
      // of a multi-pass summarization continues the banner instead of resetting).
      const sameEpoch = options?.epoch !== undefined && options.epoch === entry.epoch;
      if (!sameEpoch) return;
      entry.status = "active";
    }

    const next = applySummaryStreamAppend({ lines: entry.lines, pendingLine: entry.pendingLine }, chunk, {
      maxCompleteLines: SUMMARY_STREAM_SNAPSHOT_LINE_CAP,
    });
    entry.lines = next.lines;
    entry.pendingLine = next.pendingLine;
    entry.seq += 1;
    this.emit({ type: "append", key, chunk, seq: entry.seq });
  }

  end(key: string): void {
    const entry = this.streams.get(key);
    if (!entry) return;
    if (entry.status === "ended") return;
    entry.status = "ended";
    entry.seq += 1;
    this.emit({ type: "end", key, seq: entry.seq });
  }

  /** Drop a stream entirely (optional cleanup after UI unmount). */
  clear(key: string): void {
    this.streams.delete(key);
  }

  private toSnapshot(key: string, entry: StreamEntry): SummaryStreamSnapshot {
    return {
      key,
      source: entry.source,
      ...(entry.toolCallId ? { toolCallId: entry.toolCallId } : {}),
      ...(entry.compactId ? { compactId: entry.compactId } : {}),
      ...(entry.label ? { label: entry.label } : {}),
      ...(entry.epoch ? { epoch: entry.epoch } : {}),
      seq: entry.seq,
      lines: entry.lines.slice(),
      pendingLine: entry.pendingLine,
      status: entry.status,
    };
  }

  private emit(event: SummaryStreamEvent): void {
    // Session `summary` projection — the bus is the single change mechanism.
    this.eventBus?.emit("session:summary", event);
  }
}
