/**
 * StreamUpdater — in-place streaming reply editor (the "ChunkedUpdater" pattern).
 *
 * - Throttles edits to at most one per `editIntervalMs`, trailing edge included.
 * - Single-flight queue: edits serialize and always render the latest content.
 * - Rate-limit failures back off exponentially and retry.
 * - During streaming, oversized content shows a truncated head; `finalize()`
 *   does the real split (code-block aware): chunk 0 edits the reply message,
 *   remaining chunks go out as follow-up messages.
 */

import { splitMessage } from "./splitter.js";

import type { Button, ChatAdapter, SentMessageRef } from "../types.js";

const RATE_LIMIT_PATTERN = /429|rate.?limit|too many requests|flood/i;
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

const RATE_LIMIT_NOTE = "\n…(more)";

export interface StreamUpdaterOptions {
  adapter: ChatAdapter;
  /** Reference to the placeholder message to edit in place. */
  reply: SentMessageRef;
  editIntervalMs: number;
  onError: (error: unknown) => void;
}

export class StreamUpdater {
  private readonly adapter: ChatAdapter;
  private readonly reply: SentMessageRef;
  private readonly editIntervalMs: number;
  private readonly onError: (error: unknown) => void;

  private queue: Promise<void> = Promise.resolve();
  private latestText = "";
  private latestButtons: Button[] | undefined;
  private lastEditedText = "";
  private lastEditAt = 0;
  private editTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** True once any in-place edit has succeeded — used to stop typing heartbeats. */
  hasEdited = false;

  constructor(options: StreamUpdaterOptions) {
    this.adapter = options.adapter;
    this.reply = options.reply;
    this.editIntervalMs = options.editIntervalMs;
    this.onError = options.onError;
  }

  /** Queue a throttled in-place edit with the latest content. */
  update(text: string, buttons?: Button[]): void {
    if (this.closed) return;
    // Never regress to empty: the current-run window transiently resets when a
    // steered user message re-baselines it (renderReply returns "" for a few
    // events), and Telegram rejects empty edits with 400 "message text is empty".
    if (text.length === 0) return;
    if (text === this.latestText && buttons === this.latestButtons) return;
    this.latestText = text;
    this.latestButtons = buttons;
    const elapsed = Date.now() - this.lastEditAt;
    const delay = Math.max(0, this.editIntervalMs - elapsed);
    if (delay === 0) {
      this.enqueueEdit();
      return;
    }
    if (this.editTimer === null) {
      this.editTimer = setTimeout(() => {
        this.editTimer = null;
        this.enqueueEdit();
      }, delay);
    }
  }

  /**
   * Write the final content and stop. Content longer than the platform limit is
   * split: chunk 0 edits the reply message, remaining chunks are sent as
   * follow-up messages (buttons ride on the last chunk so they stay visible).
   */
  async finalize(): Promise<SentMessageRef[]> {
    this.closed = true;
    if (this.editTimer !== null) {
      clearTimeout(this.editTimer);
      this.editTimer = null;
    }
    const refs: SentMessageRef[] = [this.reply];
    // Nothing ever streamed (or only-empty windows) — keep the placeholder as
    //-is instead of editing it to an empty string (Telegram 400).
    if (this.latestText.trim().length === 0) return refs;
    const chunks = splitMessage(this.latestText, this.adapter.caps.maxTextLength);
    const [head, ...rest] = chunks;
    await this.enqueue(() => this.editWithBackoff(head, this.latestButtons));
    for (const [index, chunk] of rest.entries()) {
      const isLast = index === rest.length - 1;
      const buttons = isLast ? this.latestButtons : undefined;
      const ref = await this.adapter.sendText(this.reply.chat, chunk, buttons ? { buttons } : undefined);
      refs.push(ref);
    }
    return refs;
  }

  private enqueueEdit(): void {
    const preview =
      this.latestText.length > this.adapter.caps.maxTextLength
        ? this.latestText.slice(0, this.adapter.caps.maxTextLength - RATE_LIMIT_NOTE.length) + RATE_LIMIT_NOTE
        : this.latestText;
    this.enqueue(() => this.editWithBackoff(preview, this.latestButtons));
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task).catch((error) => {
      this.onError(error);
    });
    this.queue = run;
    return run;
  }

  private async editWithBackoff(text: string, buttons: Button[] | undefined): Promise<void> {
    if (text === this.lastEditedText) return;
    let backoffMs = INITIAL_BACKOFF_MS;
    for (;;) {
      try {
        await this.adapter.editMessage(this.reply.chat, this.reply.messageId, text, { buttons });
        break;
      } catch (error) {
        if (!isRateLimitError(error) || backoffMs > MAX_BACKOFF_MS) throw error;
        await sleep(backoffMs);
        backoffMs *= 2;
      }
    }
    this.lastEditAt = Date.now();
    this.lastEditedText = text;
    this.hasEdited = true;
  }
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && RATE_LIMIT_PATTERN.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
