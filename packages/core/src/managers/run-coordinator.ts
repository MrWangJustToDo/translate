export interface AbortControllerSetup {
  onAborted: () => void;
}

/**
 * Run-scoped state: abort controllers + run-lifecycle flags/timing (continuation
 * mark, turn-finalize guard, stream timing, run id). The reactive-compact retry
 * budget lives on {@link CompactionService}; cross-service orchestration belongs
 * on {@link ManagedAgent}.
 */
export class RunCoordinator {
  currentAbortController: AbortController | null = null;
  cancelAbortController: () => void = () => {};
  pendingAbortControllers: AbortController[] = [];
  private externalAbortListener: ((event: Event) => void) | null = null;
  private externalAbortSignal: AbortSignal | null = null;

  setupAbortController(abortSignal: AbortSignal | undefined, setup: AbortControllerSetup): void {
    this.cancelAbortController();
    this.currentAbortController = new AbortController();

    const abortListener = () => setup.onAborted();
    this.currentAbortController.signal.addEventListener("abort", abortListener, { once: true });
    this.cancelAbortController = () => {
      this.currentAbortController?.signal.removeEventListener("abort", abortListener);
      if (this.externalAbortSignal && this.externalAbortListener) {
        this.externalAbortSignal.removeEventListener("abort", this.externalAbortListener);
      }
      this.externalAbortSignal = null;
      this.externalAbortListener = null;
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        let item = this.pendingAbortControllers.pop();
        while (item) {
          item.abort(abortSignal.reason);
          item = this.pendingAbortControllers.pop();
        }
        setTimeout(() => this.currentAbortController?.abort(abortSignal.reason));
      } else {
        const listener = (reason: Event) => {
          let item = this.pendingAbortControllers.pop();
          while (item) {
            item.abort(reason);
            item = this.pendingAbortControllers.pop();
          }
          setTimeout(() => this.currentAbortController?.abort(reason));
        };
        abortSignal.addEventListener("abort", listener);
        this.externalAbortSignal = abortSignal;
        this.externalAbortListener = listener;
      }
    }
  }

  addPendingAbortController(abortController: AbortController): void {
    this.pendingAbortControllers.push(abortController);
  }

  removePendingAbortController(abortController: AbortController): void {
    this.pendingAbortControllers = this.pendingAbortControllers.filter((ac) => ac !== abortController);
  }

  abort(reason?: unknown): void {
    let pending = this.pendingAbortControllers.pop();
    while (pending) {
      pending.abort(reason);
      pending = this.pendingAbortControllers.pop();
    }
    this.currentAbortController?.abort(reason);
  }

  isAbortError(err: unknown): boolean {
    if (err instanceof Error) return err.name === "AbortError" || err.message.includes("aborted");
    return false;
  }

  // ==========================================================================
  // Run lifecycle flags + timing (moved from ManagedAgent — run-scoped state)
  // ==========================================================================

  /** When true, next prepareForRun skips memory prefetch / prompt:submit (steer / tool continue). */
  private prepareAsContinuation = false;
  /** Guards turn-level finalizeRun so stop() + pump outcome do not double-fire. */
  private turnLifecycleFinalized = false;
  private streamStartedAt = 0;
  private lastStreamDurationMs = 0;
  private currentRunId: string | null = null;

  markNextPrepareAsContinuation(): void {
    this.prepareAsContinuation = true;
  }

  /** Clear a leftover continuation mark (e.g. on turn finalize). */
  clearPrepareAsContinuation(): void {
    this.prepareAsContinuation = false;
  }

  /** Consume and clear the continuation flag for prepareForRun. */
  consumePrepareAsContinuation(): boolean {
    const value = this.prepareAsContinuation;
    this.prepareAsContinuation = false;
    return value;
  }

  /** Call at the start of a chat pump or detached run so finalize can run once for that turn. */
  resetTurnLifecycle(): void {
    this.turnLifecycleFinalized = false;
  }

  /** Claim turn finalization. @returns false when already finalized for this turn. */
  beginTurnFinalize(): boolean {
    if (this.turnLifecycleFinalized) return false;
    this.turnLifecycleFinalized = true;
    return true;
  }

  getStreamStartedAt(): number {
    return this.streamStartedAt;
  }

  setStreamStartedAt(value: number): void {
    this.streamStartedAt = value;
  }

  getLastStreamDurationMs(): number {
    return this.lastStreamDurationMs;
  }

  /** Snapshot wall-clock duration for the current turn into lastStreamDurationMs. */
  recordStreamDuration(): void {
    if (this.streamStartedAt <= 0) return;
    this.lastStreamDurationMs = Math.max(0, Date.now() - this.streamStartedAt);
  }

  /** Track the active run id for log run-scoping (see RunLifecycleHost). */
  setCurrentRunId(runId: string | null): void {
    this.currentRunId = runId;
  }

  getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  resetRunState(): void {
    this.abort();
    this.pendingAbortControllers = [];
    this.cancelAbortController();
    this.currentAbortController = null;
  }
}
