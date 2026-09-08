/**
 * In-memory session approval table and resume-map helpers.
 *
 * SoT for interrupt decisions across `chat()` / process restart. Channel
 * tool-call parts remain the transcript; this table feeds `resumeToolState`.
 */

import type { ToolApprovalRecord, ToolApprovalStatus } from "../persistence/types.js";
import type { ToolApprovalResolution, ToolCallPart, UIMessage } from "@tanstack/ai";

export interface UpsertToolApprovalInput {
  id: string;
  toolCallId: string;
  status: ToolApprovalStatus;
  reason?: string;
  updatedAt?: number;
  /** Tool name when the caller knows it — forwarded to the resolved callback. */
  toolName?: string;
}

function isToolCallPart(part: UIMessage["parts"][number]): part is ToolCallPart {
  return part.type === "tool-call";
}

function statusRank(status: ToolApprovalStatus): number {
  if (status === "pending") return 0;
  return 1;
}

/** In-memory approval rows keyed by toolCallId (latest decision wins). */
export class ToolApprovalTable {
  private readonly byToolCallId = new Map<string, ToolApprovalRecord>();

  /** Invoked once per actual resolution (pending → approved/denied); not on restore. */
  private readonly onResolved?: (resolution: {
    approvalId: string;
    toolCallId: string;
    decision: "approved" | "denied";
    reason?: string;
    toolName?: string;
  }) => void;

  constructor(options?: {
    onResolved?: (resolution: {
      approvalId: string;
      toolCallId: string;
      decision: "approved" | "denied";
      reason?: string;
      toolName?: string;
    }) => void;
  }) {
    this.onResolved = options?.onResolved;
  }

  restore(records: readonly ToolApprovalRecord[]): void {
    this.byToolCallId.clear();
    for (const record of records) {
      this.byToolCallId.set(record.toolCallId, { ...record });
    }
  }

  clear(): void {
    this.byToolCallId.clear();
  }

  toArray(): ToolApprovalRecord[] {
    return [...this.byToolCallId.values()].map((record) => ({ ...record }));
  }

  upsert(input: UpsertToolApprovalInput): ToolApprovalRecord {
    const existing = this.byToolCallId.get(input.toolCallId);
    // Do not downgrade an answered decision back to pending.
    if (existing && statusRank(input.status) < statusRank(existing.status)) {
      return { ...existing };
    }

    const record: ToolApprovalRecord = {
      id: input.id,
      toolCallId: input.toolCallId,
      status: input.status,
      updatedAt: input.updatedAt ?? Date.now(),
      ...(input.status === "denied" && input.reason ? { reason: input.reason } : {}),
    };
    this.byToolCallId.set(input.toolCallId, record);

    // Resolution event: only on a real pending → approved/denied transition.
    if (input.status !== "pending" && (!existing || existing.status === "pending") && this.onResolved) {
      this.onResolved({
        approvalId: input.id,
        toolCallId: input.toolCallId,
        decision: input.status === "denied" ? "denied" : "approved",
        reason: input.reason,
        toolName: input.toolName,
      });
    }

    return { ...record };
  }
}

/** Missing / empty table → backfill from UIMessage approval parts when present. */
export function normalizeSessionApprovals(
  session: { approvals?: ToolApprovalRecord[]; uiMessages?: UIMessage[] },
  now = Date.now()
): ToolApprovalRecord[] {
  const existing = session.approvals ?? [];
  if (existing.length > 0) return existing.map((record) => ({ ...record }));
  return backfillApprovalsFromUIMessages(session.uiMessages ?? [], now);
}

export function backfillApprovalsFromUIMessages(messages: UIMessage[], now = Date.now()): ToolApprovalRecord[] {
  const table = new ToolApprovalTable();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolCallPart(part) || !part.approval?.id) continue;
      const record = recordFromToolCallPart(part, now);
      if (record) table.upsert(record);
    }
  }
  return table.toArray();
}

export function recordFromToolCallPart(part: ToolCallPart, now = Date.now()): UpsertToolApprovalInput | null {
  const approval = part.approval;
  if (!approval?.id) return null;

  if (approval.needsApproval === true && approval.approved === undefined) {
    return { id: approval.id, toolCallId: part.id, status: "pending", updatedAt: now };
  }
  if (approval.approved === true) {
    return { id: approval.id, toolCallId: part.id, status: "approved", updatedAt: now };
  }
  if (approval.approved === false) {
    const extra = approval as { reason?: unknown };
    const reason = typeof extra.reason === "string" ? extra.reason : undefined;
    return { id: approval.id, toolCallId: part.id, status: "denied", reason, updatedAt: now };
  }
  return null;
}

export function findToolCallIdForApproval(messages: UIMessage[], approvalId: string): string | undefined {
  for (const message of messages) {
    for (const part of message.parts) {
      if (isToolCallPart(part) && part.approval?.id === approvalId) {
        return part.id;
      }
    }
  }
  return undefined;
}

/** Resolve the tool name of the part carrying `approvalId` (best-effort). */
export function findToolCallNameForApproval(messages: UIMessage[], approvalId: string): string | undefined {
  for (const message of messages) {
    for (const part of message.parts) {
      if (isToolCallPart(part) && part.approval?.id === approvalId) {
        return part.name;
      }
    }
  }
  return undefined;
}

/**
 * Translate answered rows into TanStack `resumeToolState.approvals`.
 * Pending rows are omitted so `executeToolCalls` still interrupts.
 */
export function approvalsToResumeMap(records: readonly ToolApprovalRecord[]): Map<string, ToolApprovalResolution> {
  const approvals = new Map<string, ToolApprovalResolution>();

  for (const record of records) {
    if (record.status === "pending") continue;

    const resolution: ToolApprovalResolution =
      record.status === "approved"
        ? true
        : {
            approved: false,
            ...(record.reason ? { payload: { reason: record.reason } } : {}),
          };

    setResumeKeys(approvals, record, resolution);
  }

  return approvals;
}

function setResumeKeys(
  approvals: Map<string, ToolApprovalResolution>,
  record: ToolApprovalRecord,
  resolution: ToolApprovalResolution
): void {
  approvals.set(record.id, resolution);
  approvals.set(record.toolCallId, resolution);
  const prefixed = `approval_${record.toolCallId}`;
  if (prefixed !== record.id) {
    approvals.set(prefixed, resolution);
  }
}
