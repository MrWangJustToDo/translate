#!/usr/bin/env node
/**
 * my-agent-im-bridge — bin entry.
 *
 * Env (see .env at the repo root, same dotenv convention as the server):
 * - REMOTE_SESSION            agent server base URL (optional) — absent ⇒ local mode
 * - TELEGRAM_BOT_TOKEN        BotFather token (required)
 * - IM_BRIDGE_ALLOW_USERS     comma-separated user ids (empty = allow all)
 * - IM_BRIDGE_ALLOW_CHATS     comma-separated chat ids (empty = allow all)
 * - IM_BRIDGE_DATA_DIR        state dir (default .agents/im-bridge)
 * - IM_BRIDGE_MODEL           optional model override (remote: sent to server; local: overrides MODEL)
 * - IM_BRIDGE_EDIT_INTERVAL_MS  streaming edit throttle (default 2000)
 * - IM_BRIDGE_STREAM_REPLY      stream the answer text while generating (default off:
 *                               progress row shows tool lines, answer lands once complete)
 * - IM_BRIDGE_APPROVAL_TTL_MS   approval/ask_user auto-deny TTL (default 300000)
 *
 * Local mode (no REMOTE_SESSION) resolves the model through the unified
 * pipeline: `.agents/config/models.json` first (same as the CLI), then `.env`
 * (MODEL / MODEL_STYLE / BASE_URL / API_KEY); SANDBOX_ENV selects the sandbox.
 */

import "dotenv/config";

import { TelegramAdapter } from "./adapters/telegram.js";
import { createImBridge } from "./bridge.js";
import { parseBridgeConfig } from "./config.js";

function log(error: unknown): void {
  console.error("[im-bridge]", error);
}

async function main(): Promise<void> {
  const config = parseBridgeConfig();
  const adapter = new TelegramAdapter({ botToken: config.telegramBotToken, onError: log });
  const bridge = await createImBridge({ config, adapter, onError: log });
  await bridge.start();
  const target = config.remoteSession ? `remote session ${config.remoteSession}` : "local mode";
  console.log(`[im-bridge] telegram bridge started → ${target}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[im-bridge] ${signal} — shutting down`);
    try {
      await bridge.stop();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[im-bridge] fatal:", error);
  process.exit(1);
});
