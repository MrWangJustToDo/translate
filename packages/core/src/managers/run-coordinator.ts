export interface AbortControllerSetup {
  onAborted: () => void;
}

/**
 * Run-scoped state only: abort controllers. The reactive-compact retry budget
 * lives on {@link CompactionService}; cross-service orchestration belongs on
 * {@link ManagedAgent}.
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

  resetRunState(): void {
    this.abort();
    this.pendingAbortControllers = [];
    this.cancelAbortController();
    this.currentAbortController = null;
  }
}
