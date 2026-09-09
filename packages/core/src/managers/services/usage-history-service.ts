/**
 * UsageHistoryService — global LLM usage persistence (contribution-graph source).
 *
 * Mirrors {@link SessionService}: a composed service on ManagedAgent owning its
 * domain, delegating disk IO to a store class ({@link UsageStore}). All agents
 * in a process share one workspace store, so appends are serialized through a
 * module-level write chain and a shared default instance is exported for call
 * sites without a ManagedAgent context (side text queries).
 *
 * Write path: fire-and-forget — a lost telemetry line must never break a run.
 */

import { UsageStore } from "../../agent/usage/usage-store.js";

import type { UsageHistoryResult, UsageRecordInput } from "../../agent/usage/usage-store.js";

export type { UsageHistoryResult, UsageRecord, UsageRecordInput } from "../../agent/usage/usage-store.js";

export class UsageHistoryService {
  private readonly store: UsageStore;

  constructor(store?: UsageStore) {
    this.store = store ?? new UsageStore();
  }

  /**
   * Record one LLM call. Appends are serialized across all service instances
   * in the process so concurrent writers cannot interleave partial JSONL lines.
   */
  record(input: UsageRecordInput): void {
    writeChain = writeChain
      .then(() => this.store.append(input))
      .then(() => undefined)
      .catch(() => {});
  }

  /** Aggregated daily buckets + per-model totals for the last `weeks` weeks. */
  getHistory(weeks: number): Promise<UsageHistoryResult> {
    return this.store.readHistory(weeks);
  }
}

/** Cross-instance append serialization (one store directory per process). */
let writeChain: Promise<void> = Promise.resolve();

/** Shared instance for call sites without a ManagedAgent (side text queries). */
export const sharedUsageHistory = new UsageHistoryService();
