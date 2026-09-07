#!/usr/bin/env node
/**
 * my-agent-im-bridge — bin entry.
 *
 * Env (see .env at the repo root, same dotenv convention as the server):
 * - REMOTE_SESSION            agent server base URL (required), e.g. http://localhost:3100
 * - TELEGRAM_BOT_TOKEN        BotFather token (required)
 * - IM_BRIDGE_ALLOW_USERS     comma-separated user ids (empty = allow all)
 * - IM_BRIDGE_ALLOW_CHATS     comma-separated chat ids (empty = allow all)
 * - IM_BRIDGE_DATA_DIR        state dir (default .agents/im-bridge)
 * - IM_BRIDGE_MODEL           optional model override (default: server's own .env)
 * - IM_BRIDGE_EDIT_INTERVAL_MS  streaming edit throttle (default 3000)
 * - IM_BRIDGE_APPROVAL_TTL_MS   approval/ask_user auto-deny TTL (default 60000)
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
  const bridge = createImBridge({ config, adapter, onError: log });
  await bridge.start();
  console.log(`[im-bridge] telegram bridge started → ${config.remoteSession}`);

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
