/**
 * Local session-plane wiring — in-process {@link AgentSessionHost}, the same
 * bootstrap path as the CLI's local mode:
 *
 * 1. CoreEnv plane: local workspace fs/shell (`createNodeEnv`, SANDBOX_ENV).
 * 2. Provider plane: direct model provider resolved from env (MODEL /
 *    MODEL_STYLE / BASE_URL / API_KEY — same field names the server reads).
 * 3. Session plane: `createLocalAgentSessionHost({ manager: agentManager })`.
 *
 * No `REMOTE_SESSION` ⇒ local mode; the bridge then hosts the agent loop in
 * process instead of talking to an agent server.
 */

import {
  agentManager,
  buildDefaultSystemPrompt,
  createDirectModelProvider,
  createLocalAgentSessionHost,
  registerCoreEnv,
  registerModelProvider,
  resolveModelConfig,
} from "@my-agent/core";
import { createNodeEnv } from "@my-agent/node";

import type { BridgeConfig } from "./config.js";
import type { AgentSessionHost, ModelStyle } from "@my-agent/core";

function parseModelStyle(value: string | undefined): ModelStyle | undefined {
  return value === "openai" || value === "anthropic" ? value : undefined;
}

/** Same env field names as the server's `readServerModelEnv`. */
function readModelEnv(env: Record<string, string | undefined> = process.env) {
  return {
    model: env.MODEL || env.model || "",
    style: parseModelStyle(env.MODEL_STYLE || env.STYLE),
    baseURL: env.BASE_URL || env.MODEL_BASE_URL || undefined,
    apiKey: env.API_KEY || "",
  };
}

/** Session-create defaults for local mode (remote mode leaves these unset — the server resolves its own). */
export interface LocalSessionDefaults {
  model: string;
  style?: ModelStyle;
  baseURL?: string;
  apiKey?: string;
  modelInfo?: unknown;
  systemPrompt: string;
}

export async function createLocalSessionHost(
  config: BridgeConfig
): Promise<{ host: AgentSessionHost; defaults: LocalSessionDefaults }> {
  const envModel = readModelEnv();
  const { connection, modelInfo } = await resolveModelConfig({
    model: config.model || envModel.model,
    style: envModel.style,
    baseURL: envModel.baseURL,
    apiKey: envModel.apiKey,
  });
  if (!connection.model?.trim()) {
    throw new Error(
      "Local mode requires a model — set MODEL (plus BASE_URL / API_KEY) in .env or IM_BRIDGE_MODEL, " +
        "or point REMOTE_SESSION at an agent server."
    );
  }

  registerCoreEnv(createNodeEnv({ rootPath: process.cwd(), sandbox: config.sandbox !== "native" }));
  registerModelProvider(
    createDirectModelProvider({
      model: connection.model,
      style: connection.style,
      baseURL: connection.baseURL,
      apiKey: connection.apiKey,
    })
  );

  return {
    host: createLocalAgentSessionHost({ manager: agentManager }),
    defaults: {
      model: connection.model,
      style: connection.style,
      baseURL: connection.baseURL,
      apiKey: connection.apiKey,
      modelInfo,
      systemPrompt: await buildDefaultSystemPrompt(),
    },
  };
}
