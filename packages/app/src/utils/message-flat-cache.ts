import type { UIMessage } from "@tanstack/ai";

export type CachedFlatMessage = {
  signature: string;
  flat: UIMessage[];
};

/** Non-reactive flatten cache (must not write createState during render). */
const MAX_FLAT_MESSAGE_ENTRIES = 150;
const cache = new Map<string, CachedFlatMessage>();

export function getFlatMessage(key: string): CachedFlatMessage | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  // LRU refresh on hit.
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

export function setFlatMessage(key: string, value: CachedFlatMessage): void {
  cache.delete(key);
  cache.set(key, value);
  // Evict oldest on overflow — a miss just re-flattens from the message.
  if (cache.size > MAX_FLAT_MESSAGE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function clearFlatMessageCache(): void {
  cache.clear();
}
