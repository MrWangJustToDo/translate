/**
 * Subscribe to the compact summary stream and accumulate raw text.
 *
 * Subscribe whenever a root session exists so `reset` / early `append` are not
 * missed while status is still catching up. Return "" unless `enabled`.
 */

import { compactSummaryStreamId, summaryStreamKey, type SummaryStreamEvent } from "@my-agent/core";
import { useEffect, useRef, useState } from "react";

import { resolveAgentSession } from "../utils/session-resolve.js";
import { cancelSummaryBuffer, flushSummaryBuffer, scheduleSummaryFlush } from "../utils/summary-stream-throttle.js";

import { useAgent } from "./use-agent.js";

export interface UseCompactSummaryTextOptions {
  enabled?: boolean;
}

export interface CompactSummaryTextResult {
  text: string;
  /** Phase label from the latest reset (multi-pass compaction); "" when absent. */
  label: string;
}

export function useCompactSummaryText(options?: UseCompactSummaryTextOptions): CompactSummaryTextResult {
  const enabled = options?.enabled ?? true;
  const rootAgentId = useAgent((s) => s.session?.id);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const textRef = useRef("");

  useEffect(() => {
    if (!rootAgentId) {
      textRef.current = "";
      setText("");
      return;
    }

    const session = resolveAgentSession(rootAgentId);
    if (!session) {
      textRef.current = "";
      setText("");
      return;
    }

    const key = summaryStreamKey("compact", compactSummaryStreamId(rootAgentId));

    const handleEvent = (event: SummaryStreamEvent) => {
      if (event.key !== key) return;
      if (event.type === "reset") {
        cancelSummaryBuffer(key);
        textRef.current = "";
        setText("");
        setLabel(event.label ?? "");
        return;
      }
      if (event.type === "append") {
        scheduleSummaryFlush(key, event.chunk, (accumulated) => {
          textRef.current += accumulated;
          setText(textRef.current);
        });
      }
      if (event.type === "end") {
        flushSummaryBuffer(key, (accumulated) => {
          textRef.current += accumulated;
          setText(textRef.current);
        });
      }
    };

    const unsub = session.subscribe(
      (evt) => {
        if (evt.channel !== "summary") return;
        handleEvent(evt.payload);
      },
      { channels: ["summary"] }
    );

    const snap = session.getSummaryStreamSnapshot(key);
    if (snap && snap.status === "active") {
      const raw = [...snap.lines, snap.pendingLine].filter(Boolean).join("");
      textRef.current = raw;
      setText(raw);
      setLabel(snap.label ?? "");
    }

    return () => {
      cancelSummaryBuffer(key);
      unsub();
    };
  }, [rootAgentId]);

  if (!enabled) return { text: "", label: "" };
  return { text, label };
}
