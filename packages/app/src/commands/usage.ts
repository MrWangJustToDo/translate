import { Box } from "ink";
import { createElement } from "react";

import { HalfLinePaddedBox } from "../components/HalfLinePaddedBox.js";
import { UsageHeatmap } from "../components/UsageHeatmap.js";
import { useConfig } from "../hooks/use-config.js";
import { BG } from "../theme/colors.js";

import { registerCommand } from "./utils/registry.js";

import type { CommandContext } from "./utils/types.js";
import type { DailyUsageBucket, ModelUsageTotal } from "@my-agent/core";
import type { ReactNode } from "react";

/** Number of months shown by default in the global activity graph. */
const DEFAULT_MONTHS = 6;
const MAX_WEEKS = 52;

/**
 * Number of Monday-aligned weekly columns needed to cover the last `months`
 * months, ending at the current week (so the grid always contains today).
 * Aligning to Monday keeps the column day-of-week labels correct at the start.
 */
function recentWeeks(months: number): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  const startMonday = new Date(start);
  startMonday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weeks = Math.round((thisMonday.getTime() - startMonday.getTime()) / (7 * 86400000)) + 1;
  return Math.max(1, weeks);
}

const DEFAULT_WEEKS = recentWeeks(DEFAULT_MONTHS);

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(cost: number): string {
  if (cost <= 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function pct(part: number, total: number): string {
  if (total <= 0) return "";
  return ` (${((part / total) * 100).toFixed(1)}%)`;
}

// ============================================================================
// Global activity — summary text rendered alongside the <UsageHeatmap/> node
// ============================================================================

function renderGlobalStats(daily: DailyUsageBucket[], models: ModelUsageTotal[], weeks: number): string[] {
  const lines: string[] = [];

  if (daily.length === 0) {
    lines.push("");
    lines.push(`  ── Global Activity (${weeks}w) ──`);
    lines.push("  (no usage history yet — it builds up as you use the agent)");
    return lines;
  }

  const totalTokens = daily.reduce((s, d) => s + d.totalTokens, 0);
  const totalCost = daily.reduce((s, d) => s + d.costUsd, 0);
  const activeDays = daily.filter((d) => d.totalTokens > 0).length;
  const avgPerDay = totalTokens / (weeks * 7);
  lines.push("");
  lines.push(`  ── Global Activity (${weeks}w) ──`);
  lines.push(
    `  ${fmt(totalTokens)} tokens · ${formatCost(totalCost)} · ${activeDays} active days · avg ${fmt(avgPerDay)}/day`
  );

  if (models.length > 1) {
    lines.push("");
    lines.push(`  ── By Model ──`);
    for (const m of models) {
      lines.push(`  ${m.model.padEnd(40)}${fmt(m.totalTokens).padStart(10)} tokens  ${formatCost(m.costUsd)}`);
    }
  }
  return lines;
}

async function fetchGlobalHistory(
  ctx: CommandContext,
  weeks: number
): Promise<{
  daily: DailyUsageBucket[];
  models: ModelUsageTotal[];
} | null> {
  const session = ctx.getSession();
  if (!session) return null;
  const result = await session.dispatch({ type: "usage.history", weeks });
  if (!result.ok) return null;
  const data = result.data as { daily?: DailyUsageBucket[]; models?: ModelUsageTotal[] } | undefined;
  if (!data) return null;
  return { daily: data.daily ?? [], models: data.models ?? [] };
}

// ============================================================================
// Command
// ============================================================================

registerCommand({
  name: "usage",
  description: "Show session token usage, cost, and a global activity graph",
  usage: "/usage [Nw]",
  immediate: true,
  execute: async (args, ctx) => {
    const session = ctx.getSession();
    if (!session) {
      return { ok: false, error: "Agent not initialized" };
    }

    const weeksMatch = /^(\d+)\s*w(week)?$/i.exec(args.trim());
    const weeks = weeksMatch ? Math.min(MAX_WEEKS, Math.max(1, parseInt(weeksMatch[1], 10))) : DEFAULT_WEEKS;

    const snap = session.getSnapshot();
    const usage = snap.usage;
    const totalUsage = usage.total;
    const currentUsage = usage.window;
    const cost = usage.cost;
    const tokenLimit = usage.tokenLimit;
    const { serverModel, model } = useConfig.getReadonlyState().config;
    const displayModel = serverModel || model;
    const lines: string[] = [];

    lines.push(`  Session:      ${snap.name} (${snap.agentId})`);
    if (displayModel) {
      lines.push(`  Model:        ${displayModel}`);
    }

    // Overall cache hit ratio across the session lifetime (cumulative).
    const cacheHitRatio = totalUsage.inputTokens > 0 ? (totalUsage.cacheReadTokens ?? 0) / totalUsage.inputTokens : 0;
    if (cacheHitRatio > 0) {
      lines.push("");
      lines.push(`  Cache hit:    ${(cacheHitRatio * 100).toFixed(1)}%`);
    }

    lines.push("");
    lines.push(`  ── Session Lifetime ──`);
    lines.push(`  Input:        ${fmt(totalUsage.inputTokens)} tokens (cumulative)`);

    const totalCacheRead = totalUsage.cacheReadTokens ?? 0;
    const totalCacheWrite = totalUsage.cacheWriteTokens ?? 0;
    if (totalCacheRead > 0) {
      lines.push(`    Cache read:   ${fmt(totalCacheRead)}${pct(totalCacheRead, totalUsage.inputTokens)}`);
    }
    if (totalCacheWrite > 0) {
      lines.push(`    Cache write:  ${fmt(totalCacheWrite)}${pct(totalCacheWrite, totalUsage.inputTokens)}`);
    }

    lines.push(`  Output:       ${fmt(totalUsage.outputTokens)} tokens`);

    const totalReasoning = totalUsage.reasoningTokens ?? 0;
    if (totalReasoning > 0) {
      const text = totalUsage.outputTokens - totalReasoning;
      lines.push(`    Reasoning:    ${fmt(totalReasoning)}${pct(totalReasoning, totalUsage.outputTokens)}`);
      lines.push(`    Text:         ${fmt(text)}`);
    }

    lines.push(`  Total:        ${fmt(totalUsage.totalTokens)} tokens`);

    // Average LLM generation rate across main-loop calls (cumulative output tokens /
    // cumulative model time). Side queries (titles, summaries, memory selection) are
    // intentionally excluded so this reflects the agent's own generation speed.
    if (usage.llmDurationMs > 0) {
      const rate = usage.llmOutputTokens / (usage.llmDurationMs / 1000);
      lines.push(`  Speed:        ${rate.toFixed(1)} tok/s (output)`);
    }

    const contextInput = currentUsage.inputTokens;
    if (contextInput > 0) {
      const contextCacheRead = currentUsage.cacheReadTokens ?? 0;
      const pctText =
        tokenLimit > 0
          ? ` (${Math.min(100, (contextInput / tokenLimit) * 100).toFixed(0)}% of ${fmt(tokenLimit)})`
          : "";
      lines.push("");
      lines.push(`  ── Current Context ──`);
      lines.push(`  Context:      ${fmt(contextInput)} tokens${pctText}`);
      if (contextCacheRead > 0 && totalCacheRead > 0) {
        lines.push(`    Cache read:   ${fmt(contextCacheRead)}${pct(contextCacheRead, contextInput)}`);
      }
    }

    lines.push(`  Session cost: ${formatCost(cost)}`);

    // Global contribution graph — best effort; a failed/dispatch-unsupported
    // session (e.g. store unavailable) just omits the section.
    let graphNode: ReactNode | undefined;
    try {
      const global = await fetchGlobalHistory(ctx, weeks);
      if (global) {
        graphNode = createElement(
          HalfLinePaddedBox,
          { backgroundColor: BG.message },
          createElement(Box, { paddingLeft: 1 }, createElement(UsageHeatmap, { daily: global.daily, weeks }))
        );
        lines.push(...renderGlobalStats(global.daily, global.models, weeks));
      }
    } catch {
      // ignore — session section is already complete
    }

    return { ok: true, message: lines.join("\n"), node: graphNode };
  },
});
