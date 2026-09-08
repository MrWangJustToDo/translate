/**
 * Shared agent initialization — binds an {@link AgentSession} into the app.
 *
 * The host process owns session-plane wiring: it constructs the
 * {@link AgentSessionHost} (local via `@my-agent/core`'s
 * `createLocalAgentSessionHost`, or remote via `@my-agent/server`'s
 * `createRemoteAgentSessionHost`) and injects it here. CoreEnv / model
 * provider registration likewise happens in the host process before render —
 * this module stays free of core runtime singletons.
 */

import { buildDefaultSystemPrompt, resolveModelConfigFromProvider } from "@my-agent/core";

import { clearExtensionCommands, syncExtensionCommands } from "../commands";
import { useConfig } from "../hooks/use-config.js";

import type { AppConfig, InitResult } from "./types.js";
import type { useAgent as useAgentType } from "../hooks/use-agent.js";
import type { useTodoManager as useTodoManagerType } from "../hooks/use-todo-manager.js";
import type { AgentSession, AgentSessionHost } from "@my-agent/core";

/** Wire AgentSession (+ Host) into the app store. */
export function bindAgentSession(
  session: AgentSession | null,
  hooks: Pick<AdapterHooks, "useAgent">,
  host?: AgentSessionHost | null
): void {
  if (session) {
    hooks.useAgent.getActions().registerSession(session, { activate: true });
  } else {
    hooks.useAgent.getActions().setSession(null);
  }
  if (host !== undefined) {
    hooks.useAgent.getActions().setHost(host);
  }
}

export interface AdapterHooks {
  useAgent: typeof useAgentType;
  useTodoManager: typeof useTodoManagerType;
}

export interface CreateAgentOptions {
  config: AppConfig;
  name: string;
  hooks: AdapterHooks;
  /**
   * Session plane owner, constructed by the host process (required).
   * Local: `createLocalAgentSessionHost({ manager: agentManager })`.
   * Remote: `createRemoteAgentSessionHost(baseUrl)` (`@my-agent/server`).
   */
  host: AgentSessionHost;
}

export async function createAgentFromConfig({ config, name, hooks, host }: CreateAgentOptions): Promise<InitResult> {
  const { connection, modelInfo, providerMode } = await resolveModelConfigFromProvider({
    model: config.model,
    style: config.style,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    modelInfo: config.modelInfo,
  });

  if (!connection.model?.trim() && !config.remoteSession) {
    throw new Error(
      "No model configured. Set MODEL / --model, use --remote-provider so the provider server supplies MODEL, " +
        "or use --remote-session so the agent server's provider supplies MODEL."
    );
  }

  useConfig.getActions().updateConfig({
    model: connection.model,
    style: connection.style,
    baseURL: connection.baseURL,
    apiKey: providerMode === "remote" ? "" : connection.apiKey,
    modelInfo,
    providerMode,
  });

  const { session, initialMessages } = await host.create({
    name,
    model: connection.model,
    systemPrompt: config.systemPrompt || (config.remoteSession ? undefined : await buildDefaultSystemPrompt()),
    maxIterations: config.maxIterations,
    mcpConfigPath: config.mcpConfigPath || undefined,
    extensionDirs: config.extensionDirs?.length ? config.extensionDirs : undefined,
    modelStyle: connection.style,
    modelBaseURL: connection.baseURL,
    modelApiKey: connection.apiKey,
    modelInfo,
    continueSession: config.continueSession || undefined,
    resumeSessionId: config.resumeSession && config.resumeSession !== "__picker__" ? config.resumeSession : undefined,
    // Survives `initConfig` via applyOptionalAppConfig (CLI BRAVE_API_KEY / WEBSEARCH_PROVIDER).
    ...(config.toolConfig ? { toolConfig: config.toolConfig } : {}),
  });

  const { useAgent, useTodoManager } = hooks;
  const snap = session.getSnapshot();
  const initial = initialMessages ?? [];

  // Remote Agent Session without an explicit local model: the agent server
  // resolves the model from its own `.env`. Surface that resolved model so the
  // UI shows the real model name instead of a blank one.
  if (!connection.model?.trim() && snap.model) {
    // Display-only: writing `model` here would flip useAgentChat's effect dep and
    // tear down (DELETE) the remote session we just created via adapter.destroy().
    // Keep it out of the session-rebuild deps (see use-agent-chat effect).
    useConfig.getActions().updateConfig({ serverModel: snap.model });
  }

  // Session registration is the caller's job (`bindAgentSession`), NOT done here.
  // Registering inside this async function races with use-agent-chat's effect
  // rebuild: `updateConfig` above flips the effect deps (config.model/baseURL/...),
  // the old init's session gets registered unconditionally (no currentInitId guard
  // here), and the store ends up with two live sessions (Header shows "2 sessions").
  // The caller registers after its initId guard, so a stale init's session never
  // enters the store.
  useAgent.getActions().setHost(host);
  useTodoManager.getActions().setFromSession(snap.todos, snap.todosTitle);
  syncExtensionCommands(session);

  return { host, session, ...(initial.length ? { initialMessages: initial } : {}) };
}

let sessionCounter = 0;

/**
 * Create an additional live session on an already-initialized host, reusing the
 * resolved model config from {@link useConfig} (the bootstrap session's provider
 * resolution). Registers and activates it in the app store.
 */
export async function createSessionOnHost({
  host,
  hooks,
  name,
}: {
  host: AgentSessionHost;
  hooks: AdapterHooks;
  name?: string;
}): Promise<InitResult> {
  const config = { ...useConfig.getReadonlyState().config } as AppConfig;

  const { session, initialMessages } = await host.create({
    name: name ?? `session-${++sessionCounter}`,
    model: config.model,
    systemPrompt: config.systemPrompt,
    maxIterations: config.maxIterations,
    mcpConfigPath: config.mcpConfigPath || undefined,
    extensionDirs: config.extensionDirs?.length ? config.extensionDirs : undefined,
    modelStyle: config.style,
    modelBaseURL: config.baseURL,
    modelApiKey: config.apiKey,
    modelInfo: config.modelInfo,
    ...(config.toolConfig ? { toolConfig: config.toolConfig } : {}),
  });

  const { useAgent, useTodoManager } = hooks;
  const snap = session.getSnapshot();
  const initial = initialMessages ?? [];

  useAgent.getActions().registerSession(session, { activate: true });
  useTodoManager.getActions().setFromSession(snap.todos, snap.todosTitle);
  syncExtensionCommands(session);

  return { host, session, ...(initial.length ? { initialMessages: initial } : {}) };
}

export function clearAdapterHooks(hooks: AdapterHooks): void {
  clearExtensionCommands();
  hooks.useAgent.getActions().setHost(null);
  hooks.useAgent.getActions().setSession(null);
  hooks.useTodoManager.getActions().clear();
}
