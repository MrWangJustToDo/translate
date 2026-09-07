/**
 * Subscribe to a keyed summary stream (task / compact) via AgentSession / Host.
 */

import {
  applyAppendToDisplayWindow,
  displayWindowFromSnapshot,
  emptySummaryDisplayWindow,
  renderSummaryDisplayRows,
  summaryStreamKey,
  type SummaryDisplayWindow,
  type SummaryStreamEvent,
  type SummaryStreamSource,
} from "@my-agent/core";
import { useEffect, useMemo, useState } from "react";

import { resolveAgentSession } from "../utils/session-resolve.js";
import { cancelSummaryBuffer, flushSummaryBuffer, scheduleSummaryFlush } from "../utils/summary-stream-throttle.js";

import { useAgent } from "./use-agent.js";

export interface UseSummaryStreamOptions {
  enabled?: boolean;
  maxLines?: number;
  source: SummaryStreamSource;
  toolCallId?: string;
  compactId?: string;
  agentId?: string;
}

export interface UseSummaryStreamResult {
  rows: string[];
  hidden: number;
  status: "idle" | "active" | "ended" | "missing";
  pendingLine: string;
}

function resolveKey(options: UseSummaryStreamOptions): string | undefined {
  if (options.source === "task") {
    return options.toolCallId ? summaryStreamKey("task", options.toolCallId) : undefined;
  }
  return options.compactId ? summaryStreamKey("compact", options.compactId) : undefined;
}

export function useSummaryStream(options: UseSummaryStreamOptions): UseSummaryStreamResult {
  const enabled = options.enabled ?? true;
  const maxLines = options.maxLines ?? 5;
  const contentSlots = Math.max(1, maxLines - 1);
  const key = resolveKey(options);
  const rootAgentId = useAgent((s) => s.session?.id);
  const agentId = options.agentId || rootAgentId;

  const [windowState, setWindowState] = useState<SummaryDisplayWindow>(() => emptySummaryDisplayWindow());
  const [status, setStatus] = useState<UseSummaryStreamResult["status"]>("missing");

  useEffect(() => {
    if (!enabled || !agentId || !key) {
      setWindowState(emptySummaryDisplayWindow());
      setStatus("missing");
      return;
    }

    const session = resolveAgentSession(agentId);
    if (!session) {
      setWindowState(emptySummaryDisplayWindow());
      setStatus("missing");
      return;
    }

    const applyEvent = (event: SummaryStreamEvent) => {
      if (event.key !== key) return;
      if (event.type === "reset") {
        cancelSummaryBuffer(key);
        setWindowState(emptySummaryDisplayWindow());
        setStatus("active");
        return;
      }
      if (event.type === "append") {
        scheduleSummaryFlush(key, event.chunk, (accumulated) => {
          setWindowState((prev) => applyAppendToDisplayWindow(prev, accumulated, contentSlots));
          setStatus("active");
        });
      }
      if (event.type === "end") {
        flushSummaryBuffer(key, (accumulated) => {
          setWindowState((prev) => applyAppendToDisplayWindow(prev, accumulated, contentSlots));
        });
        setStatus("ended");
      }
    };

    const unsub = session.subscribe(
      (evt) => {
        if (evt.channel !== "summary") return;
        applyEvent(evt.payload);
      },
      { channels: ["summary"] }
    );
    const snap = session.getSummaryStreamSnapshot(key);
    if (snap) {
      setWindowState(displayWindowFromSnapshot(snap, contentSlots));
      setStatus(snap.status === "idle" ? "missing" : snap.status);
    } else {
      setWindowState(emptySummaryDisplayWindow());
      setStatus("missing");
    }

    return () => {
      cancelSummaryBuffer(key);
      unsub();
    };
  }, [enabled, agentId, key, contentSlots]);

  return useMemo(() => {
    const rendered = renderSummaryDisplayRows(windowState, maxLines);
    return {
      rows: rendered.rows,
      hidden: rendered.hidden,
      status,
      pendingLine: windowState.pendingLine,
    };
  }, [windowState, maxLines, status]);
}
