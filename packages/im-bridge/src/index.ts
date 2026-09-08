/**
 * @my-agent/im-bridge — generic IM bridge for My Agent.
 *
 * Connects chat platforms (Telegram today, Slack/Discord/Feishu adapters share
 * the same {@link ChatAdapter} contract) to an AgentSession server via
 * `createRemoteAgentSessionHost` — the same session path as the CLI's
 * `--remote-session`. The bridge registers no CoreEnv and no ModelProvider;
 * model configuration lives on the agent server's `.env`.
 */

export { BridgeRuntime, createImBridge, type BridgeRuntimeOptions } from "./bridge.js";
export { createLocalSessionHost, type LocalSessionDefaults } from "./local-host.js";
export { bridgeConfigSchema, parseBridgeConfig, type BridgeConfig } from "./config.js";
export { AccessControl } from "./access.js";
export {
  decodeButtonPayload,
  encodeButtonPayload,
  PendingInteractionStore,
  type PendingRecord,
} from "./interaction/pending.js";
export { renderReply, renderResolved, scanPendingInteractions, type RenderedReply } from "./interaction/render.js";
export { SessionResolver, sessionKeyOf, type ResolvedSession, type SessionEntry } from "./session-resolver.js";
export { splitMessage } from "./streaming/splitter.js";
export { StreamUpdater, type StreamUpdaterOptions } from "./streaming/stream-updater.js";
export { TelegramAdapter, type TelegramAdapterOptions } from "./adapters/telegram.js";
export type {
  AdapterCaps,
  Button,
  ButtonCallback,
  ButtonPayload,
  ChatAdapter,
  ChatTarget,
  InboundMessage,
  PendingInteraction,
  SendOptions,
  SentMessageRef,
} from "./types.js";
