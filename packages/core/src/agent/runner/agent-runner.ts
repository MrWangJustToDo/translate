import { chat, maxIterations } from "@tanstack/ai";

import { DEFAULT_AGENT_MAX_ITERATIONS } from "../../managers/agent-types.js";
import { assertAsyncIterable } from "../stream/assert-async-iterable.js";

import { createToolRunContext, type ToolRunContext } from "./run-context.js";

import type { ModelStyle } from "../../models/config/model-config.js";
import type { ReasoningEffort } from "../../models/types.js";
import type {
  AnyTextAdapter,
  ChatMiddleware,
  LazyToolsConfig,
  ModelMessage,
  ServerTool,
  StreamChunk,
  UIMessage,
  SystemPrompt,
} from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export interface AgentRunnerConfig {
  adapter: AnyTextAdapter;
  /** Model id (informational — already bound on the adapter from {@link createTextAdapter}). */
  model: string;
  maxIterations?: number;
  systemPrompts?: Array<SystemPrompt>;
  tools?: ServerTool[];
  middleware?: ChatMiddleware<ToolRunContext>[];
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Reasoning effort level to send on every request.
   * OpenAI-compatible adapters get `reasoning_effort`; Anthropic gets `effort`.
   * Undefined → model default.
   */
  reasoningEffort?: ReasoningEffort;
  /** API style — determines the reasoning-effort wire key. */
  modelStyle?: ModelStyle;
  /**
   * Optional lazy-tool discovery config. Only used when some tool is `lazy: true`;
   * tunes how much of each lazy tool's description appears in the discovery catalog.
   * Defaults to `{ includeDescription: 'none' }` (library side).
   */
  lazyToolsConfig?: LazyToolsConfig;
}

export interface AgentRunnerRunInput {
  messages?: Array<UIMessage | ModelMessage>;
  /**
   * Preferred: the same AbortController identity owned by {@link ManagedAgent.run}.
   * `ManagedAgent.abort()` must abort this controller to cancel TanStack `chat()`.
   * Production runs always pass this (via executeManagedAgentRun after prepareForRun).
   */
  abortController?: AbortController;
  /**
   * Fallback only: when `abortController` is omitted, create a fresh controller and
   * link this signal. Not used by the main/subagent run path today; kept for
   * resolveAbortController / ad-hoc AgentRunner callers.
   */
  abortSignal?: AbortSignal;
  threadId?: string;
  runId?: string;
  agentId: string;
}

// ============================================================================
// AgentRunner
// ============================================================================

/**
 * Lightweight TanStack `chat()` wrapper. Holds immutable configuration only —
 * no status, session, memory, or usage state between runs.
 */
export class AgentRunner {
  private readonly config: AgentRunnerConfig;

  constructor(config: AgentRunnerConfig) {
    this.config = config;
  }

  /** Resolve the AbortController passed to TanStack `chat()`. */
  static resolveAbortController(input: Pick<AgentRunnerRunInput, "abortController" | "abortSignal">): AbortController {
    if (input.abortController) {
      return input.abortController;
    }

    const abortController = new AbortController();
    if (input.abortSignal) {
      if (input.abortSignal.aborted) {
        abortController.abort(input.abortSignal.reason);
      } else {
        input.abortSignal.addEventListener("abort", () => abortController.abort(input.abortSignal!.reason), {
          once: true,
        });
      }
    }
    return abortController;
  }

  /** Execute one agent run and yield AG-UI stream chunks. */
  run(input: AgentRunnerRunInput): AsyncIterable<StreamChunk> {
    const abortController = AgentRunner.resolveAbortController(input);

    const toolContext = createToolRunContext(input.agentId);

    const stream = chat({
      adapter: this.config.adapter,
      messages: input.messages,
      systemPrompts: this.config.systemPrompts,
      tools: this.config.tools,
      middleware: this.config.middleware,
      context: toolContext,
      abortController,
      threadId: input.threadId,
      runId: input.runId,
      agentLoopStrategy: maxIterations(this.config.maxIterations ?? DEFAULT_AGENT_MAX_ITERATIONS),
      lazyToolsConfig: this.config.lazyToolsConfig,
      // Silence [tanstack-ai:errors] console dumps — they break Ink TUI layout.
      // Failures still surface via RUN_ERROR / agent:stream-error / ManagedAgent.error.
      debug: false,
      modelOptions: {
        ...(this.config.temperature != null ? { temperature: this.config.temperature } : {}),
        ...(this.config.maxOutputTokens != null ? { maxTokens: this.config.maxOutputTokens } : {}),
        ...(this.config.reasoningEffort
          ? this.config.modelStyle === "anthropic"
            ? { effort: this.config.reasoningEffort }
            : { reasoning_effort: this.config.reasoningEffort }
          : {}),
      },
    });

    assertAsyncIterable(stream, `chat(model=${this.config.model})`);
    return stream;
  }

  setMaxOutputTokens(max: number): void {
    this.config.maxOutputTokens = max;
  }
}
