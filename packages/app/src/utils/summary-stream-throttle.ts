/**
 * Per-key trailing flush scheduler for summary streams (compact / task).
 *
 * Mirrors {@link streaming-ingest}'s per-toolCallId buffering: append chunks are
 * accumulated per summary-stream key and flushed to the consumer once per
 * throttle window via setTimeout (trailing edge). Consumers keep their own state
 * and pass a flush callback that receives the accumulated text.
 */

interface SummaryBuffer {
  text: string;
  timer?: ReturnType<typeof setTimeout>;
}

/** Default throttle window for summary-stream appends. */
export const SUMMARY_STREAM_THROTTLE_MS = 50;

const buffers = new Map<string, SummaryBuffer>();

/**
 * Accumulate `chunk` for `key` and schedule a single trailing flush.
 * The flush callback receives the accumulated text since the last flush.
 */
export function scheduleSummaryFlush(
  key: string,
  chunk: string,
  flush: (accumulated: string) => void,
  throttleMs: number = SUMMARY_STREAM_THROTTLE_MS
): void {
  let buffer = buffers.get(key);
  if (!buffer) {
    buffer = { text: "" };
    buffers.set(key, buffer);
  }

  buffer.text += chunk;

  if (buffer.timer) return;

  buffer.timer = setTimeout(() => {
    const accumulated = buffer.text;
    buffers.delete(key);
    flush(accumulated);
  }, throttleMs);
}

/** Cancel any pending flush for `key` (e.g. on reset, key change, or unmount). */
export function cancelSummaryBuffer(key: string): void {
  const buffer = buffers.get(key);
  if (!buffer) return;
  if (buffer.timer) {
    clearTimeout(buffer.timer);
  }
  buffers.delete(key);
}

/**
 * Synchronously flush any buffered text for `key` (e.g. on stream `end`, so
 * trailing chunks are not lost). No-op when there is nothing buffered.
 */
export function flushSummaryBuffer(key: string, flush: (accumulated: string) => void): void {
  const buffer = buffers.get(key);
  if (!buffer || buffer.text.length === 0) return;
  if (buffer.timer) {
    clearTimeout(buffer.timer);
  }
  const accumulated = buffer.text;
  buffers.delete(key);
  flush(accumulated);
}
