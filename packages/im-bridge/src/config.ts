/**
 * IM bridge configuration — Zod v4 schema over environment variables.
 *
 * The bridge is a pure AgentSession client: it registers no CoreEnv and no
 * ModelProvider. Session creation POSTs to `/api/agent` WITHOUT a model by
 * default, so the agent server resolves the model from its own `.env`
 * (packages/server/src/routes/agent-session.ts — explicit client model wins,
 * otherwise the server-side provider supplies MODEL).
 */

import { z } from "zod";

export const bridgeConfigSchema = z.object({
  /** Agent server base URL (`REMOTE_SESSION`), e.g. `http://localhost:3100`. */
  remoteSession: z.url(),
  telegramBotToken: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  /** User id allowlist (comma-separated env). Empty = allow all. */
  allowUsers: z.array(z.string()).default([]),
  /** Chat id allowlist (comma-separated env). Empty = allow all. */
  allowChats: z.array(z.string()).default([]),
  /** Persistent state directory (session mapping journal). */
  dataDir: z.string().default(".agents/im-bridge"),
  /**
   * Optional model override sent in the `POST /api/agent` body
   * (`IM_BRIDGE_MODEL`). Leave unset to let the server's own `.env` decide.
   */
  model: z.string().optional(),
  /** Min interval between streaming edits in ms. */
  editIntervalMs: z.number().int().positive().default(3000),
  /** Pending approval / ask_user TTL in ms (auto-deny on expiry). 5 min — IM users answer async. */
  approvalTtlMs: z.number().int().positive().default(300_000),
  /** Prefix for created agent session names (display only). */
  sessionNamePrefix: z.string().default("im"),
});

export type BridgeConfig = z.infer<typeof bridgeConfigSchema>;

function splitList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toPositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Parse and validate bridge configuration from an env-like record (defaults to `process.env`). */
export function parseBridgeConfig(env: Record<string, string | undefined> = process.env): BridgeConfig {
  const result = bridgeConfigSchema.safeParse({
    remoteSession: env.REMOTE_SESSION,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    allowUsers: splitList(env.IM_BRIDGE_ALLOW_USERS),
    allowChats: splitList(env.IM_BRIDGE_ALLOW_CHATS),
    dataDir: env.IM_BRIDGE_DATA_DIR,
    model: env.IM_BRIDGE_MODEL?.trim() === "" ? undefined : env.IM_BRIDGE_MODEL,
    editIntervalMs: toPositiveInt(env.IM_BRIDGE_EDIT_INTERVAL_MS),
    approvalTtlMs: toPositiveInt(env.IM_BRIDGE_APPROVAL_TTL_MS),
    sessionNamePrefix: env.IM_BRIDGE_SESSION_NAME_PREFIX,
  });
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid im-bridge configuration: ${issues}`);
  }
  return result.data;
}
