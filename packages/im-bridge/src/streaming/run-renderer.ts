/**
 * RunRenderer — ordered, non-streaming outbound rendering of one agent run.
 *
 * Projects the run's UIMessage parts IN ORDER onto one chat message per
 * segment (`renderRunSegments`): assistant text and tool status lines appear
 * exactly as the app's message view renders them.
 *
 * Tool lines are GROUPED: consecutive tool calls (nothing but more tool calls
 * between them) share ONE message that is edited in place as they complete,
 * instead of one bubble per call. Adjacent-only merging keeps the posted
 * message order identical to the run's part order (text / group / text / group
 * …), so nothing reorders. An interaction (approval / ask_user, whose buttons
 * ride its own message) is never merged and terminally splits the groups
 * around it; once a tool has been an interaction it stays pinned standalone so
 * a group can never re-absorb it (which would duplicate its line).
 * Deliberately NOT streaming — IM in-place edit streams render poorly and
 * burn rate limits:
 * - text segments post once, complete, as soon as they are sealed (a later
 *   part exists) — the final answer lands via `finalize()` at run end;
 * - tool GROUPS post once every member is done, then re-edit as later members
 *   append lines; a running tool never freezes mid-state;
 * - the ONLY in-place updates are tool groups (lines append) and interaction
 *   messages: an approval / ask_user posts immediately with its buttons riding
 *   on the tool call's own message, and is edited (buttons dropped, final line)
 *   when resolved.
 *
 * The "⏳" placeholder message is claimed (edited in place) by the first
 * posted segment, so the reply reads top-down without a dangling hourglass.
 *
 * STRICT ORDER: sends and edits serialize through ONE queue, in segment order —
 * the chat transcript always reads top-down exactly like the app's message view
 * (assistant text / tool lines / interaction rows never reorder). An interaction
 * row's buttons therefore wait for the segments before it, but the interaction's
 * TTL only starts once the row is actually rendered (`onInteractionRendered`) —
 * a long run's tool-line backlog can delay the row, never silently expire it.
 */

import { renderRunSegments, type RunSegment } from "../interaction/render.js";

import { splitMessage } from "./splitter.js";

import type { Button, ChatAdapter, ChatTarget, SentMessageRef } from "../types.js";
import type { UIMessage } from "@tanstack/ai";

export interface RunRendererOptions {
  adapter: ChatAdapter;
  chat: ChatTarget;
  /** The "⏳" placeholder — claimed (edited in place) by the first posted segment. */
  placeholderRef: SentMessageRef;
  onError: (error: unknown) => void;
  /** Diagnostic channel (bridge logs it to `<dataDir>/bridge.log`). */
  onDebug?: (message: string) => void;
  /**
   * Fired ONCE per interaction segment, the moment its buttons are actually
   * visible on the platform. The bridge starts the answer TTL here — not at
   * registration — so a row delayed behind the tool-line backlog still gets its
   * full answer window instead of expiring before the user ever sees it.
   */
  onInteractionRendered?: (segmentKey: string) => void;
}

interface SegmentState {
  /** Stable identity: tool parts key by `tool:<partId>`, text by `${message.id}:${partIndex}`, tool groups by `group:<first member key>`. */
  key: string;
  kind: "text" | "tool";
  /** Tool only: a collapsed run of consecutive tool calls sharing one message (interactions are never grouped, so a group never carries buttons). */
  group: boolean;
  /** Latest rendered text. */
  text: string;
  buttons?: Button[];
  /** Text only: a later part exists (or finalize ran) — the content is complete. */
  sealed: boolean;
  /** Tool only: posted while awaiting an interaction — eligible for follow-up edits. */
  awaitingResolution: boolean;
  /** Tool only: set by settle() when a click/TTL resolved the row — forces the follow-up edit even if the projection flipped `done` before posting (see r1 race). */
  settled?: boolean;
  /** Tool only: no further state change expected (output landed / denied). */
  done: boolean;
  /** Tool only: awaiting approval or an ask_user answer. */
  pending: boolean;
  /** Set once the interaction row's buttons are visible — arms the answer TTL. */
  renderedNotified: boolean;
  /** Set after the first successful post; null until then. */
  ref: SentMessageRef | null;
  lastText: string;
  lastButtons?: Button[];
}

/** One projected outbound unit: a text part, a lone interaction tool, or a collapsed tool group. */
interface RunRow {
  key: string;
  kind: "text" | "tool";
  text: string;
  done: boolean;
  pending: boolean;
  group: boolean;
}

export class RunRenderer {
  private readonly adapter: ChatAdapter;
  private readonly chat: ChatTarget;
  private readonly placeholderRef: SentMessageRef;
  private readonly onError: (error: unknown) => void;
  private readonly onDebug: (message: string) => void;
  private readonly onInteractionRendered: (segmentKey: string) => void;

  /** Insertion order = first-appearance order = the run's actual part order. */
  private readonly segments = new Map<string, SegmentState>();
  /**
   * Tool segment keys that have ever been an interaction (pending approval /
   * ask_user). They are pinned to their own message forever: a group must never
   * re-absorb a resolved interaction, or its line would exist twice.
   */
  private readonly standaloneToolKeys = new Set<string>();
  /**
   * The single ordered outbound queue. Every send/edit appends here, so the
   * transcript mirrors the run's segment order exactly — interactions included.
   */
  private queue: Promise<void> = Promise.resolve();
  /** Claimed (edited) by the first posted segment instead of a fresh send. */
  private placeholderClaimed = false;
  private closed = false;

  constructor(options: RunRendererOptions) {
    this.adapter = options.adapter;
    this.chat = options.chat;
    this.placeholderRef = options.placeholderRef;
    this.onError = options.onError;
    this.onDebug = options.onDebug ?? (() => {});
    this.onInteractionRendered = options.onInteractionRendered ?? (() => {});
  }

  /**
   * Apply the latest run projection. New segments append in part order; known
   * segments update in place. Empty text never creates a segment (steer
   * re-baselines transiently reset the run window).
   */
  sync(messages: UIMessage[]): void {
    if (this.closed) return;
    const rows = this.collapse(renderRunSegments(messages));
    const produced = new Set<string>();
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      produced.add(row.key);
      let state = this.segments.get(row.key);
      if (state === undefined) {
        state = {
          key: row.key,
          kind: row.kind,
          group: row.group,
          text: row.text,
          sealed: false,
          awaitingResolution: false,
          settled: false,
          done: row.done,
          pending: row.pending,
          renderedNotified: false,
          ref: null,
          lastText: "",
        };
        this.segments.set(row.key, state);
      }
      // Never regress to empty; later parts only ever append.
      if (row.text.length > 0) state.text = row.text;
      state.done = row.done;
      state.pending = row.pending;
      state.group = row.group;
      if (row.kind === "text" && index < rows.length - 1) state.sealed = true;
    }
    this.pruneUnreferencedGroups(produced);
    this.reconcile();
  }

  /**
   * Collapse consecutive non-interactive tool segments into ONE tool group row.
   *
   * Order is preserved because only ADJACENT tool segments merge — a text part
   * still breaks the sequence, so the posted message order stays exactly the
   * run's part order (text / group / text / group …).
   *
   * An interaction (pending approval / ask_user) is emitted standalone (its
   * buttons need their own message) and terminally splits the groups around it;
   * {@link standaloneToolKeys} pins it so it is never merged afterwards.
   */
  private collapse(flat: RunSegment[]): RunRow[] {
    const rows: RunRow[] = [];
    let current: RunRow | null = null;
    for (const segment of flat) {
      if (segment.kind === "text") {
        current = null;
        rows.push({ ...segment, group: false });
        continue;
      }
      if (segment.pending || this.standaloneToolKeys.has(segment.key)) {
        this.standaloneToolKeys.add(segment.key);
        current = null;
        rows.push({ ...segment, group: false });
        continue;
      }
      if (current === null) {
        current = {
          key: `group:${segment.key}`,
          kind: "tool",
          text: segment.text,
          done: segment.done,
          pending: false,
          group: true,
        };
        rows.push(current);
        continue;
      }
      current.text = `${current.text}\n${segment.text}`;
      current.done = current.done && segment.done;
    }
    return rows;
  }

  /**
   * Drop unposted group rows that vanished from the projection. A group member
   * turning into an interaction splits the group, orphaning the never-posted
   * group object (the interaction gets its own `tool:<id>` row instead). Posted
   * rows are kept as history.
   */
  private pruneUnreferencedGroups(produced: Set<string>): void {
    for (const [key, state] of this.segments) {
      if (state.group && state.ref === null && !produced.has(key)) this.segments.delete(key);
    }
  }

  /**
   * Attach buttons on a tool segment's message — the approval / ask_user flow
   * renders ON the tool call's own message, not as a separate one. Call after
   * `sync` so the segment exists (interactions are scanned from the same run
   * projection).
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
   * Immediate feedback for an answered interaction (click or TTL expiry): drop
   * the buttons and show the outcome on the tool's own message right away —
   * the run's own events re-render the line (running → ✓) when they arrive.
   * This is an interaction message, so the in-place edit is allowed.
   *
   * Returns whether the segment was found and settled (diagnostics: a `false`
   * here means the click landed on a row this renderer no longer tracks).
   */
  settle(segmentKey: string, text: string): boolean {
    const segment = this.segments.get(segmentKey);
    // Apply when still awaiting resolution OR the row still carries buttons — a
    // frozen row with a stale flag is worth settling so the user gets feedback.
    // Only skip when the row is already terminal AND button-less (a stale click).
    if (!segment || this.closed || segment.kind !== "tool") {
      // Diagnose WHY the click missed — a frozen row with an unexplained miss
      // is undiagnosable after the fact.
      const known = this.segments.get(segmentKey);
      const keySample = [...this.segments.keys()].slice(-4).join(", ");
      this.onDebug(
        `settle MISS key=${segmentKey} exists=${known !== undefined} closed=${this.closed} kind=${known?.kind ?? "-"} awaiting=${known?.awaitingResolution ?? "-"} buttons=${known?.buttons === undefined ? "none" : "set"} mapSize=${this.segments.size} recentKeys=[${keySample}]`
      );
      return false;
    }
    const active = segment.awaitingResolution || segment.buttons !== undefined;
    if (!active) {
      const known = this.segments.get(segmentKey);
      const keySample = [...this.segments.keys()].slice(-4).join(", ");
      this.onDebug(
        `settle MISS key=${segmentKey} exists=${known !== undefined} closed=${this.closed} kind=${known?.kind ?? "-"} awaiting=${known?.awaitingResolution ?? "-"} buttons=${known?.buttons === undefined ? "none" : "set"} mapSize=${this.segments.size} recentKeys=[${keySample}]`
      );
      return false;
    }
    segment.buttons = undefined;
    if (segment.text !== text) segment.text = text;
    segment.settled = true;
    this.reconcile();
    return true;
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
        try {
          if (segment.kind === "text") {
            if (segment.ref !== null || segment.text.trim().length === 0) continue;
            for (const chunk of splitMessage(segment.text, this.adapter.caps.maxTextLength)) {
              segment.ref = await this.post(chunk, undefined);
            }
          } else if (segment.ref === null) {
            await this.postSegment(segment);
          } else if (segment.group) {
            if (segment.text !== segment.lastText) await this.editSegment(segment);
          } else if ((segment.awaitingResolution || segment.settled) && segment.done) {
            await this.editSegment(segment);
            segment.awaitingResolution = false;
            segment.lastText = segment.text;
            segment.lastButtons = undefined;
          }
        } catch (error) {
          // Terminal flush is best-effort per segment — one failure must not
          // drop the remaining segments' content.
          this.onError(error);
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
      try {
        await this.flushSegment(segment);
      } catch (error) {
        // One failing segment must not starve the rest of the run's output:
        // keep it dirty (lastSent/lastButtons untouched) so later reconciles
        // retry it, and let the remaining segments render.
        this.onError(error);
      }
    }
  }

  private async flushSegment(segment: SegmentState): Promise<void> {
    if (segment.kind === "text") {
      if (segment.ref !== null || !segment.sealed || segment.text.trim().length === 0) return;
      segment.ref = await this.post(segment.text, undefined);
      segment.lastText = segment.text;
      return;
    }
    if (segment.ref === null) {
      const isInteraction = segment.buttons !== undefined;
      // A tool GROUP posts only once EVERY member is done: a still-running
      // member must not freeze a partial line, and a member that turns into an
      // interaction instead gets its own row (the group then splits).
      if (segment.group) {
        if (!segment.done && !isInteraction) return;
        await this.postSegment(segment);
        return;
      }
      // Post immediately when an interaction needs buttons; otherwise wait
      // for completion so a "running" line never freezes mid-state.
      // An interaction (buttons attached) is ALWAYS awaiting its user answer
      // even if the projection momentarily reads `done` (the r1 race: the
      // part resolved between setButtons and the flush) — button + await so
      // a subsequent click can always settle the row.
      if (!isInteraction && !segment.pending && !segment.done) return;
      await this.postSegment(segment);
      return;
    }
    // A posted group appends its members' lines as they complete.
    if (segment.group) {
      if (!segment.done || segment.text === segment.lastText) return;
      await this.editSegment(segment);
      return;
    }
    // Skip only when the row is not an interaction AND wasn't settled AND has
    // no buttons to drop — a settled row (click/TTL) or one still carrying
    // buttons must be edited.
    if (!segment.awaitingResolution && !segment.settled && segment.buttons === undefined) {
      return;
    }
    // The only in-place edits: an interaction message progressing toward
    // its terminal state (⏸ → running → ✓) and dropping its buttons. Edit only
    // when the content or buttons actually changed (a done row already flush-
    // edited once must not re-edit every reconcile).
    if (segment.text === segment.lastText && segment.buttons === segment.lastButtons) return;
    await this.editSegment(segment);
    segment.settled = false;
    if (segment.done) segment.awaitingResolution = false;
  }

  /** Post a not-yet-posted segment; arms the answer TTL when buttons go live. */
  private async postSegment(segment: SegmentState): Promise<void> {
    const isInteraction = segment.buttons !== undefined;
    segment.ref = await this.post(segment.text, isInteraction ? segment.buttons : undefined);
    segment.awaitingResolution = isInteraction || segment.pending;
    segment.lastText = segment.text;
    segment.lastButtons = segment.buttons;
    if (isInteraction) this.notifyRendered(segment);
  }

  /**
   * Edit an interaction row in place: show/hide buttons and update its status
   * line (⏸ → running → ✓). Buttons are cleared once the row is done.
   */
  private async editSegment(segment: SegmentState): Promise<void> {
    const showButtons = !segment.done && segment.buttons !== undefined;
    await this.edit(segment.ref as SentMessageRef, segment.text, showButtons ? segment.buttons : undefined);
    segment.lastText = segment.text;
    segment.lastButtons = showButtons ? segment.buttons : undefined;
    if (segment.done || !showButtons) segment.buttons = undefined;
    if (showButtons) this.notifyRendered(segment);
  }

  /** Fire the rendered hook exactly once per interaction segment. */
  private notifyRendered(segment: SegmentState): void {
    if (segment.renderedNotified) return;
    segment.renderedNotified = true;
    try {
      this.onInteractionRendered(segment.key);
    } catch (error) {
      this.onError(error);
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
