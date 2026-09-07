import type { UIMessage } from "@tanstack/ai";

export type CachedFlatMessage = {
  signature: string;
  flat: UIMessage[];
};

/** Non-reactive flatten cache (must not write createState during render). */
const MAX_FLAT_MESSAGE_ENTRIES = 150;
const cache = new Map<string, CachedFlatMessage>();
/** Insertion-order queue of cache keys — first-arrived entries are evicted first. */
const order: string[] = [];

export function getFlatMessage(key: string): CachedFlatMessage | undefined {
  return cache.get(key);
}

export function setFlatMessage(key: string, value: CachedFlatMessage): void {
  // FIFO by first arrival: only newly seen keys join the queue, so eviction
  // always removes the oldest-inserted entry (Map iteration order is fine, but
  // an explicit queue keeps the policy obvious and access-independent).
  const isNew = !cache.has(key);
  cache.set(key, value);
  if (isNew) order.push(key);
  while (order.length > MAX_FLAT_MESSAGE_ENTRIES) {
    const oldest = order.shift();
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function clearFlatMessageCache(): void {
  cache.clear();
  order.length = 0;
}
