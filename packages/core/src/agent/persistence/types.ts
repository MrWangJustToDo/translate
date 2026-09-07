/**
 * Session Types - Type definitions for session persistence and resume.
 *
 * Each session is persisted as an append-only JSONL journal
 * `.agents/sessions/{id}.session.log` (source of truth) plus a materialized
 * snapshot `.agents/sessions/{id}.session.json` (cache).
 */

import { z } from "zod";

import type { ModelStyle, ReasoningEffort } from "../../models/types.js";
import type { TokenUsage } from "../../runtime-types/token-usage.js";
import type { PlanModeState } from "../plan/plan-mode-controller.js";
import type { TodoItem } from "../todo";
import type { UIMessage } from "@tanstack/ai";

// ============================================================================
// Constants
// ============================================================================

/** v5: writes are journaled to {id}.session.log (JSONL, source of truth) and the
 * .session.json becomes a materialized snapshot. v4 files (snapshot only) still load. */
export const SESSION_VERSION = 5;
export const SESSION_DIR = ".agents/sessions";
export const SESSION_FILE_SUFFIX = ".session.json";
/** Append-only JSONL journal recording whole-state checkpoints; crash-safe source of truth. */
export const SESSION_LOG_SUFFIX = ".session.log";
/** Journal record `kind` for whole-state checkpoints (slice 1). Future slices add semantic kinds. */
export const SESSION_JOURNAL_KIND = "checkpoint";

/** Directory for per-session AgentLog JSONL files: `.agents/logs/{sessionId}/`. */
export const AGENT_LOG_DIR = ".agents/logs";

// ============================================================================
// Session Data Schema
// ============================================================================

export const sessionMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  modelStyle: z.enum(["openai", "anthropic"]),
  model: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type SessionMeta = z.infer<typeof sessionMetaSchema>;

export const toolApprovalStatusSchema = z.enum(["pending", "approved", "denied"]);

export const toolApprovalRecordSchema = z.object({
  id: z.string(),
  toolCallId: z.string(),
  status: toolApprovalStatusSchema,
  reason: z.string().optional(),
  updatedAt: z.number(),
});

export type ToolApprovalStatus = z.infer<typeof toolApprovalStatusSchema>;
export type ToolApprovalRecord = z.infer<typeof toolApprovalRecordSchema>;

// ============================================================================
// Journal Record Schema
// ============================================================================

/**
 * One line of the append-only session journal (`{id}.session.log`).
 * `kind: "checkpoint"` carries a full SessionData payload (slice 1); the field is
 * reserved so future slices can add semantic per-mutation events to the same log.
 */
export const sessionJournalRecordSchema = z.object({
  /** Journal format version. */
  v: z.number().int().positive(),
  /** Monotonically increasing per-session sequence. */
  seq: z.number().int().positive(),
  /** Record kind; readers ignore unknown kinds. */
  kind: z.string(),
  /** Epoch ms when the record was appended. */
  ts: z.number(),
  /** Record payload; for checkpoints, the full SessionData. */
  data: z.unknown(),
});

export type SessionJournalRecord = z.infer<typeof sessionJournalRecordSchema>;

export interface SessionData {
  /** Unique session identifier */
  id: string;
  /** Human-readable session name (auto-generated from first message) */
  name: string;
  /** Schema version for future migrations */
  version: number;
  /** API style used for this session */
  modelStyle: ModelStyle;
  /** Model name used */
  model: string;
  /** Full conversation as UIMessages (for client display on resume; includes in-chain summaries) */
  uiMessages: UIMessage[];
  /** Token usage statistics */
  usage: TokenUsage;
  /** Session cost in USD */
  cost?: number;
  /** Last SDK-reported input tokens (actual context window fill for percentage display) */
  contextTokens?: number;
  /** Active todos */
  todos: TodoItem[];
  /** Todo set title (optional; older sessions omit this). */
  todoTitle?: string | null;
  /** Whether todos are bound to plan building (optional; older sessions omit this). */
  todoPlanBound?: boolean;
  /** Reasoning effort level for this session (OpenAI `reasoning_effort` / Anthropic `effort`). */
  reasoningEffort?: ReasoningEffort;
  /**
   * Plan-mode lifecycle snapshot (phase, markdown, path, seeded flags).
   * Omitted or null when plan mode is off. Older sessions omit this field.
   */
  planMode?: PlanModeState | null;
  /** When true, skip all tool approvals (auto / YOLO mode). Older sessions omit this. */
  autoMode?: boolean;
  /**
   * Tool-approval interrupt table (pending / approved / denied).
   * Older sessions omit this; runtime treats missing as `[]`.
   */
  approvals?: ToolApprovalRecord[];
  /**
   * Seq of the newest journal record this state reflects. Internal persistence
   * metadata: anchors the next append (seq+1) and lets load() replay journal
   * records newer than the snapshot. Not surfaced to hosts; older sessions omit it.
   */
  journalSeq?: number;
  /**
   * Epoch ms when a live agent last *reserved* this (still-empty) session for
   * startup reuse. Lets a second process/agent skip a concurrently reused
   * session whose live owner is not visible to it (cross-process ownership is
   * intentionally not shared). The window expires on its own if the reserving
   * process crashed, keeping "live-exclusive" semantics. Not surfaced to hosts.
   */
  reservedAt?: number;
  /**
   * @deprecated Legacy field renamed to `autoMode`. Kept for backward compatibility
   * with sessions persisted before the rename. New sessions use `autoMode`.
   */
  autoApprove?: boolean;
  /** Timestamp when session was created */
  createdAt: number;
  /** Timestamp when session was last updated */
  updatedAt: number;
}

// ============================================================================
// Resume Result
// ============================================================================

export interface ResumeResult {
  /** UIMessages for client to display */
  uiMessages: UIMessage[];
  /** Session metadata */
  session: SessionMeta;
}
