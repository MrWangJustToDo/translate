/**
 * Cache for UI→model wire projection (`getModelVisibleMessages` + convert).
 *
 * Fingerprint is cheap: channel revision + last message id/len + policy key.
 * On hit, return the same array reference so the engine can skip work.
 */

import type { ModelMessage } from "@tanstack/ai";

export interface WireProjectionCacheEntry {
  fingerprint: string;
  wireMessages: ModelMessage[];
}

/** Approximate content length of the last message without full JSON.stringify. */
export function lastMessageContentLen(message: { parts?: readonly unknown[] } | undefined): number {
  if (!message?.parts || message.parts.length === 0) return 0;
  let len = message.parts.length;
  for (const part of message.parts) {
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    if (typeof record.content === "string") len += record.content.length;
    else if (typeof record.text === "string") len += record.text.length;
    else if (typeof record.output === "string") len += record.output.length;
    else if (record.output != null) len += 8;
  }
  return len;
}

/**
 * Build a fingerprint for wire projection invalidation.
 * Prefer channel `revision` (bumped on every messages change) over deep equality.
 */
export function wireSourceFingerprint(
  revision: number,
  messages: ReadonlyArray<{ id?: string; parts?: readonly unknown[] }>,
  policyKey: string
): string {
  const last = messages[messages.length - 1];
  const lastId = typeof last?.id === "string" ? last.id : "";
  return `${revision}:${messages.length}:${lastId}:${lastMessageContentLen(last)}:${policyKey}`;
}

/** Stable policy key matching {@link keepPolicyProjectionOptions} field names. */
export function policyKeyFromOptions(options: { keepRecentTokens?: number }): string {
  return `t:${options.keepRecentTokens ?? 0}`;
}

export class WireProjectionCache {
  private entry: WireProjectionCacheEntry | null = null;

  getOrCompute(fingerprint: string, compute: () => ModelMessage[]): ModelMessage[] {
    if (this.entry && this.entry.fingerprint === fingerprint) {
      return this.entry.wireMessages;
    }
    const wireMessages = compute();
    this.entry = { fingerprint, wireMessages };
    return wireMessages;
  }

  /** Drop cached wire (clear / restore / compact / explicit invalidation). */
  invalidate(): void {
    this.entry = null;
  }

  /** Test helper: fingerprint of the retained entry, if any. */
  peekFingerprint(): string | null {
    return this.entry?.fingerprint ?? null;
  }
}
