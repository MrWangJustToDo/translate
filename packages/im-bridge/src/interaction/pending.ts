/**
 * PendingInteractionStore — tracks interactions awaiting a user answer.
 *
 * Button payloads stay tiny (`{a,r,i}` — Telegram `callback_data` caps at 64
 * bytes); the full context (tool name, ids, chat, expiry) lives here, keyed by
 * a short request id. Records expire after a TTL with an auto-deny callback,
 * mirroring chat-bot approval conventions (60s default).
 */

import type { Button, ButtonPayload, ChatTarget, PendingInteraction } from "../types.js";

export interface PendingRecord {
  requestId: string;
  /** Session key (`platform:chatId:threadId`) the interaction belongs to. */
  chatKey: string;
  chat: ChatTarget;
  /** User id that is allowed to answer. */
  userId: string;
  pending: PendingInteraction;
  /** Message the buttons were rendered on (for post-resolution cleanup). */
  messageId: string | null;
  expiresAt: number;
}

export function encodeButtonPayload(payload: ButtonPayload): string {
  return JSON.stringify(payload);
}

export function decodeButtonPayload(data: string): ButtonPayload | undefined {
  try {
    const parsed = JSON.parse(data) as Partial<ButtonPayload>;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    if (parsed.a !== "y" && parsed.a !== "n" && parsed.a !== "o") return undefined;
    if (typeof parsed.r !== "string") return undefined;
    return {
      a: parsed.a,
      r: parsed.r,
      ...(typeof parsed.i === "number" ? { i: parsed.i } : {}),
    };
  } catch {
    return undefined;
  }
}

export class PendingInteractionStore {
  private readonly records = new Map<string, PendingRecord>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private counter = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly onExpire: (record: PendingRecord) => void | Promise<void>
  ) {}

  /** Build the button row for a pending interaction. */
  buttonsFor(pending: PendingInteraction, requestId: string): Button[] {
    if (pending.kind === "approval") {
      return [
        { label: "✅ Approve", data: encodeButtonPayload({ a: "y", r: requestId }) },
        { label: "❌ Deny", data: encodeButtonPayload({ a: "n", r: requestId }) },
      ];
    }
    return pending.options.map((option, index) => ({
      // Long option text must stay a usable label (platform button caps ~64 chars).
      label: option.length > 60 ? `${option.slice(0, 59)}…` : option,
      data: encodeButtonPayload({ a: "o", r: requestId, i: index }),
    }));
  }

  /** Next short request id for a button payload (pre-reserve before sending buttons). */
  nextRequestId(): string {
    return `r${++this.counter}`;
  }

  register(
    pending: PendingInteraction,
    context: { chatKey: string; chat: ChatTarget; userId: string; messageId: string | null },
    requestId: string = this.nextRequestId()
  ): PendingRecord {
    const record: PendingRecord = {
      requestId,
      chatKey: context.chatKey,
      chat: context.chat,
      userId: context.userId,
      pending,
      messageId: context.messageId,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.records.set(requestId, record);
    const timer = setTimeout(
      () => {
        this.records.delete(requestId);
        this.timers.delete(requestId);
        void this.onExpire(record);
      },
      Math.max(this.ttlMs, 1)
    );
    this.timers.set(requestId, timer);
    return record;
  }

  /** Resolve a callback; undefined when the request is unknown or already answered. */
  resolve(payload: ButtonPayload): PendingRecord | undefined {
    const record = this.records.get(payload.r);
    if (!record) return undefined;
    this.records.delete(payload.r);
    const timer = this.timers.get(payload.r);
    if (timer) clearTimeout(timer);
    this.timers.delete(payload.r);
    return record;
  }

  /** Whether the given user may answer this record. */
  canAnswer(record: PendingRecord, userId: string): boolean {
    return record.userId === userId;
  }

  pendingCount(): number {
    return this.records.size;
  }

  /** Cancel all pending records (bridge shutdown / session reset). */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.records.clear();
  }
}
