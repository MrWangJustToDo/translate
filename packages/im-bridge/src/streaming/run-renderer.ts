/**
 * RunRenderer — ordered, non-streaming outbound rendering of one agent run.
 *
 * Projects the run's UIMessage parts IN ORDER onto one chat message per
 * segment (`renderRunSegments`): assistant text and tool status lines appear
 * exactly as the app's message view renders them, instead of bunching every
 * tool line into a single progress row.
 *
 * Deliberately NOT streaming — IM in-place edit streams render poorly and
 * burn rate limits:
 * - text segments post once, complete, as soon as they are sealed (a later
 *   part exists) — the final answer lands via `finalize()` at run end;
 * - tool segments post once when done; running tools wait;
 * - the ONLY in-place updates are interaction messages: an approval /
 *   ask_user posts immediately with its buttons riding on the tool call's own
 *   message, and is edited (buttons dropped, final line) when resolved.
 *
 * The "⏳" placeholder message is claimed (edited in place) by the first
 * posted segment, so the reply reads top-down without a dangling hourglass.
 * Sends and edits serialize through one queue to preserve platform order.
 */

import { renderRunSegments } from "../interaction/render.js";

import { splitMessage } from "./splitter.js";

import type { Button, ChatAdapter, ChatTarget, SentMessageRef } from "../types.js";
import type { UIMessage } from "@tanstack/ai";

export interface RunRendererOptions {
  adapter: ChatAdapter;
  chat: ChatTarget;
  /** The "⏳" placeholder — claimed (edited in place) by the first posted segment. */
  placeholderRef: SentMessageRef;
  onError: (error: unknown) => void;
}

interface SegmentState {
  /** Stable identity: `${message.id}:${partIndex}` — parts stream append-only. */
  key: string;
  kind: "text" | "tool";
  /** Latest rendered text. */
  text: string;
  buttons?: Button[];
  /** Text only: a later part exists (or finalize ran) — the content is complete. */
  sealed: boolean;
  /** Tool only: posted while awaiting an interaction — eligible for follow-up edits. */
  awaitingResolution: boolean;
  /** Tool only: no further state change expected (output landed / denied). */
  done: boolean;
  /** Tool only: awaiting approval or an ask_user answer. */
  pending: boolean;
  /** Set after the first successful post; null until then. */
  ref: SentMessageRef | null;
  lastText: string;
  lastButtons?: Button[];
}

export class RunRenderer {
  private readonly adapter: ChatAdapter;
  private readonly chat: ChatTarget;
  private readonly placeholderRef: SentMessageRef;
  private readonly onError: (error: unknown) => void;

  /** Insertion order = first-appearance order = the run's actual part order. */
  private readonly segments = new Map<string, SegmentState>();
  private queue: Promise<void> = Promise.resolve();
  /** Claimed (edited) by the first posted segment instead of a fresh send. */
  private placeholderClaimed = false;
  private closed = false;

  constructor(options: RunRendererOptions) {
    this.adapter = options.adapter;
    this.chat = options.chat;
    this.placeholderRef = options.placeholderRef;
    this.onError = options.onError;
  }

  /** True once any segment content has been posted to the chat. */
  get hasOutput(): boolean {
    return this.placeholderClaimed;
  }

  /**
   * Apply the latest run projection. New segments append in part order; known
   * segments update in place. Empty text never creates a segment (steer
   * re-baselines transiently reset the run window).
   */
  sync(messages: UIMessage[]): void {
    if (this.closed) return;
    const flat = renderRunSegments(messages);
    for (let index = 0; index < flat.length; index++) {
      const segment = flat[index];
      let state = this.segments.get(segment.key);
      if (state === undefined) {
        state = {
          key: segment.key,
          kind: segment.kind,
          text: segment.text,
          sealed: false,
          awaitingResolution: false,
          done: segment.done,
          pending: segment.pending,
          ref: null,
          lastText: "",
        };
        this.segments.set(segment.key, state);
      }
      // Never regress to empty; later parts only ever append.
      if (segment.text.length > 0) state.text = segment.text;
      state.done = segment.done;
      state.pending = segment.pending;
      if (segment.kind === "text" && index < flat.length - 1) state.sealed = true;
    }
    this.reconcile();
  }

  /**
   * Attach (or clear) buttons on a tool segment's message — the approval /
   * ask_user flow renders ON the tool call's own message, not as a separate
   * one. Call after `sync` so the segment exists (interactions are scanned
   * from the same run projection).
   */
  setButtons(segmentKey: string, buttons: Button[] | undefined): void {
    const segment = this.segments.get(segmentKey);
    if (!segment || this.closed || segment.buttons === buttons) return;
    segment.buttons = buttons;
    // A lingering clickable row after a click is misleading — reconcile now
    // instead of waiting for the next run event.
    this.reconcile();
  }

  /**
   * Flush everything not yet posted and stop. Unsealed text segments (the
   * run's answer) post here, split code-block aware when over the platform
   * limit. `fallbackText` replaces the placeholder when the run finished
   * without ever rendering a segment.
   */
  async finalize(fallbackText = "✅ done"): Promise<void> {
    if (this.closed) {
      await this.queue.catch(() => {});
      return;
    }
    this.closed = true;
    this.enqueue(async () => {
      for (const segment of this.segments.values()) {
        if (segment.kind === "text") {
          if (segment.ref !== null || segment.text.trim().length === 0) continue;
          for (const chunk of splitMessage(segment.text, this.adapter.caps.maxTextLength)) {
            segment.ref = await this.post(chunk, undefined);
          }
        } else if (segment.ref === null) {
          segment.ref = await this.post(segment.text, segment.pending ? segment.buttons : undefined);
          segment.awaitingResolution = segment.pending;
          segment.lastText = segment.text;
          segment.lastButtons = segment.buttons;
        } else if (segment.awaitingResolution && segment.done) {
          await this.edit(segment.ref, segment.text, undefined);
          segment.awaitingResolution = false;
          segment.lastText = segment.text;
          segment.lastButtons = undefined;
        }
      }
      if (!this.placeholderClaimed) {
        // Nothing was ever rendered — replace the "⏳" so it doesn't look stuck.
        try {
          await this.adapter.editMessage(this.chat, this.placeholderRef.messageId, fallbackText);
        } catch (error) {
          this.onError(error);
        }
      }
    });
    await this.queue.catch(() => {});
  }

  /**
   * Fatal-path retirement (dispatch failure / expired session): stop rendering
   * and replace the placeholder with an error notice. Already-posted segments
   * stay as history.
   */
  async fail(text: string): Promise<void> {
    if (this.closed) {
      await this.queue.catch(() => {});
      return;
    }
    this.closed = true;
    this.enqueue(async () => {
      try {
        await this.adapter.editMessage(this.chat, this.placeholderRef.messageId, text);
      } catch (error) {
        this.onError(error);
      }
    });
    await this.queue.catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private reconcile(): void {
    if (this.closed) return;
    this.enqueue(() => this.flush());
  }

  private async flush(): Promise<void> {
    for (const segment of this.segments.values()) {
      if (segment.kind === "text") {
        if (segment.ref !== null || !segment.sealed || segment.text.trim().length === 0) continue;
        segment.ref = await this.post(segment.text, undefined);
        segment.lastText = segment.text;
      } else if (segment.ref === null) {
        // Post immediately when an interaction needs buttons; otherwise wait
        // for completion so a "running" line never freezes mid-state.
        if (!segment.pending && !segment.done) continue;
        segment.ref = await this.post(segment.text, segment.pending ? segment.buttons : undefined);
        segment.awaitingResolution = segment.pending;
        segment.lastText = segment.text;
        segment.lastButtons = segment.buttons;
      } else if (segment.awaitingResolution) {
        // The only in-place edits: an interaction message progressing toward
        // its terminal state (⏸ → running → ✓) and dropping its buttons.
        const done = segment.done;
        if (!done && segment.text === segment.lastText && segment.buttons === segment.lastButtons) continue;
        await this.edit(segment.ref, segment.text, done ? undefined : segment.buttons);
        segment.lastText = segment.text;
        segment.lastButtons = done ? undefined : segment.buttons;
        if (done) segment.awaitingResolution = false;
      }
    }
  }

  /** Post a segment message: the first one claims the placeholder via edit. */
  private async post(text: string, buttons: Button[] | undefined): Promise<SentMessageRef> {
    if (!this.placeholderClaimed) {
      this.placeholderClaimed = true;
      const ref = this.placeholderRef;
      await this.edit(ref, text, buttons);
      return ref;
    }
    return this.adapter.sendText(this.chat, text, buttons ? { buttons } : undefined);
  }

  private async edit(ref: SentMessageRef, text: string, buttons: Button[] | undefined): Promise<void> {
    await this.adapter.editMessage(ref.chat, ref.messageId, text, buttons ? { buttons } : undefined);
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((error) => {
      this.onError(error);
    });
  }
}
