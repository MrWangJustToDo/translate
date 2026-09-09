import type { AgentSession, AgentSessionHost, AgentToolConfig, ModelInfo, ModelStyle } from "@my-agent/core";
import type { UIMessage } from "@tanstack/ai";
import type { ReactNode } from "react";

// ============================================================================
// App Configuration
// ============================================================================

export interface AppConfig {
  model: string;
  /** API style: OpenAI-compatible or Anthropic Messages */
  style: ModelStyle;
  /** API base URL (defaults per style when empty) */
  baseURL: string;
  apiKey: string;
  systemPrompt: string;
  initialPrompt: string;
  maxIterations: number;
  debug: boolean;
  mcpConfigPath: string;
  /**
   * Extra extension directories (comma-separated on CLI as `--extension-dirs`).
   * Merged ahead of `.agents/extension` and `~/.agents/extension`.
   */
  extensionDirs: string[];
  continueSession: boolean;
  resumeSession: string;
  /**
   * Optional remote CoreEnv (workspace) base URL (`--remote-env` / REMOTE_ENV).
   * When set, hosts register a remote CoreEnv instead of the local Node env.
   */
  remoteEnv?: string;
  /**
   * Optional remote model provider base URL (`--remote-provider` / REMOTE_PROVIDER).
   * Keys stay on the provider server; API key is not a local secret.
   */
  remoteProvider?: string;
  /**
   * Optional remote Agent Session base URL (`--remote-session` / REMOTE_SESSION).
   * When set, hosts may bind {@link AgentSession} via RemoteSessionClient.
   */
  remoteSession?: string;
  /** Optional model metadata override (hosts may parse MODEL_* env vars) */
  modelInfo?: ModelInfo;
  /**
   * Server-resolved model (e.g. `--remote-session` defers model to the server's
   * `.env`). Display-only: kept out of the agent-chat effect deps so the
   * initialization-time update does not tear down the just-created session.
   */
  serverModel?: string;
  /**
   * How LLM credentials are resolved for this session.
   * `remote` = provider server holds keys; UI should not treat apiKey as a local secret.
   */
  providerMode?: "direct" | "remote";
  /** Explicit tool secrets / prefs (e.g. Brave websearch). Hosts parse env and pass here. */
  toolConfig?: AgentToolConfig;
}

// ============================================================================
// Command Result
// ============================================================================

export type CommandResult = { ok: true; message?: string; node?: ReactNode } | { ok: false; error: string };

// ============================================================================
// Initialization Result
// ============================================================================

export interface InitResult {
  /** Session catalog / factory for this process (or remote HTTP Host). */
  host: AgentSessionHost;
  /** Active AgentSession — UI control surface. */
  session: AgentSession;
  initialMessages?: UIMessage[];
}

// ============================================================================
// Clipboard
// ============================================================================

export interface ClipboardImageResult {
  data: string;
  mediaType: string;
}

// ============================================================================
// Agent Adapter Interface
// ============================================================================

export interface AgentAdapter {
  initialize(config: AppConfig): Promise<InitResult>;
  destroy(): Promise<void>;
  exit(): void;
  readClipboardImage?(): Promise<ClipboardImageResult | null>;
}
