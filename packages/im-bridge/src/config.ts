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
  /**
   * Agent server base URL (`REMOTE_SESSION`), e.g. `http://localhost:3100`.
   * Absent ⇒ local mode: the bridge hosts the agent loop in process (CoreEnv +
   * model provider resolved from `.env`, same bootstrap as the CLI's local mode).
   */
  remoteSession: z.url().optional(),
  telegramBotToken: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  /** User id allowlist (comma-separated env). Empty = allow all. */
  allowUsers: z.array(z.string()).default([]),
  /** Chat id allowlist (comma-separated env). Empty = allow all. */
  allowChats: z.array(z.string()).default([]),
  /** Persistent state directory (session mapping journal). */
  dataDir: z.string().default(".agents/im-bridge"),
  /**
   * Optional model override. Remote: sent in the `POST /api/agent` body
   * (`IM_BRIDGE_MODEL`), unset lets the server's own `.env` decide. Local:
   * overrides MODEL from `.env`.
   */
  model: z.string().optional(),
  /** Local-mode OS sandbox (`SANDBOX_ENV`: local | native). Remote mode ignores this. */
  sandbox: z.enum(["local", "native"]).default("local"),
  /** Min interval between progress-row edits in ms. 2s keeps Telegram edit rate limits comfortable. */
  editIntervalMs: z.number().int().positive().default(2000),
  /** Pending approval / ask_user TTL in ms (auto-deny on expiry). 5 min — IM users answer async. */
  approvalTtlMs: z.number().int().positive().default(300_000),
  /** Prefix for created agent session names (display only). */
  sessionNamePrefix: z.string().default("im"),
  // Local-mode session defaults, resolved at bootstrap (remote mode leaves unset).
  modelStyle: z.enum(["openai", "anthropic"]).optional(),
  modelBaseURL: z.string().optional(),
  modelApiKey: z.string().optional(),
  modelInfo: z.unknown().optional(),
  systemPrompt: z.string().optional(),
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
    remoteSession: env.REMOTE_SESSION ? z.url().parse(env.REMOTE_SESSION) : undefined,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    allowUsers: splitList(env.IM_BRIDGE_ALLOW_USERS),
    allowChats: splitList(env.IM_BRIDGE_ALLOW_CHATS),
    dataDir: env.IM_BRIDGE_DATA_DIR,
    model: env.IM_BRIDGE_MODEL?.trim() === "" ? undefined : env.IM_BRIDGE_MODEL,
    sandbox: env.SANDBOX_ENV === "native" ? "native" : "local",
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
