/**
 * Buffers streaming chunks and flushes to the reactive store on a throttle schedule.
 * Throttle is configured per toolCallId by {@link useStreamingOutput} consumers.
 */

import { useStreamingStore } from "../hooks/use-streaming-store.js";

// ============================================================================
// Types
// ============================================================================

interface StreamBuffer {
  stdout: string;
  stderr: string;
  flushTimer?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// State
// ============================================================================

const buffers = new Map<string, StreamBuffer>();
const throttleMsByToolCallId = new Map<string, Set<number>>();

function getEffectiveThrottleMs(toolCallId: string): number {
  const values = throttleMsByToolCallId.get(toolCallId);
  if (!values || values.size === 0) return 0;
  return Math.min(...values);
}

function flushToStore(toolCallId: string): void {
  const buffer = buffers.get(toolCallId);
  if (!buffer) return;

  if (buffer.flushTimer) {
    clearTimeout(buffer.flushTimer);
    buffer.flushTimer = undefined;
  }

  useStreamingStore.getActions().update(toolCallId, {
    stdout: buffer.stdout,
    stderr: buffer.stderr,
  });
}

function scheduleFlush(toolCallId: string): void {
  const buffer = buffers.get(toolCallId);
  if (!buffer) return;

  const throttleMs = getEffectiveThrottleMs(toolCallId);
  if (throttleMs <= 0) {
    flushToStore(toolCallId);
    return;
  }

  if (buffer.flushTimer) return;

  buffer.flushTimer = setTimeout(() => {
    buffer.flushTimer = undefined;
    flushToStore(toolCallId);
  }, throttleMs);
}

// ============================================================================
// Public API
// ============================================================================

/** Register a consumer's throttle preference for a tool call. */
export function registerStreamingThrottle(toolCallId: string, throttleMs: number): () => void {
  const ms = Math.max(0, throttleMs);
  let values = throttleMsByToolCallId.get(toolCallId);
  if (!values) {
    values = new Set();
    throttleMsByToolCallId.set(toolCallId, values);
  }
  values.add(ms);

  return () => {
    const current = throttleMsByToolCallId.get(toolCallId);
    if (!current) return;
    current.delete(ms);
    if (current.size === 0) {
      throttleMsByToolCallId.delete(toolCallId);
    }
  };
}

/** Append a chunk to the buffer and schedule a throttled store flush. */
export function ingestStreamingChunk(toolCallId: string, type: "stdout" | "stderr", chunk: string): void {
  let buffer = buffers.get(toolCallId);
  if (!buffer) {
    buffer = { stdout: "", stderr: "" };
    buffers.set(toolCallId, buffer);
  }

  if (type === "stdout") {
    buffer.stdout += chunk;
  } else {
    buffer.stderr += chunk;
  }

  scheduleFlush(toolCallId);
}

/** Clear buffer + store for a tool call (e.g. subagent retry or hook unmount). */
export function clearStreamingIngest(toolCallId: string): void {
  const buffer = buffers.get(toolCallId);
  if (buffer?.flushTimer) {
    clearTimeout(buffer.flushTimer);
  }
  buffers.delete(toolCallId);
  useStreamingStore.getActions().clear(toolCallId);
}

/** Test helper — read the reactive snapshot for a tool call. */
export function getStreamingStoreOutput(toolCallId: string) {
  return useStreamingStore.getReadonlyState().outputs[toolCallId];
}
