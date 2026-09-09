import { createAnthropicChat } from "@tanstack/ai-anthropic";

import { createChatCompletions } from "./chat-completions-text-adapter.js";
import { createReasoningChatCompletions } from "./reasoning-chat-completions-adapter.js";
import { shouldEchoReasoningContent } from "./reasoning-echo.js";

import type { ModelInfo, ModelPricing, ModelStyle } from "../types.js";
import type { AnyTextAdapter } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export interface TextAdapterConfig {
  adapter: AnyTextAdapter;
  /** Model id passed to `chat({ model })` */
  model: string;
  /** API protocol style — determines the reasoning-effort wire key. */
  modelStyle: ModelStyle;
  /** Whether the model advertises the `reasoning` capability. */
  reasoning?: boolean;
  /** Pricing from the resolved ModelInfo (models.dev) — lets side queries cost + record their own usage. */
  pricing?: ModelPricing;
}

export interface ModelAdapterConfig {
  style: ModelStyle;
  model: string;
  baseURL: string;
  apiKey?: string;
  /**
   * Resolved model metadata (models.dev). The advertised `reasoning` capability
   * routes thinking-enabled models through the reasoning adapter without a
   * brand-name allow-list.
   */
  modelInfo?: ModelInfo | null;
}

// ============================================================================
// Adapter Factory
// ============================================================================

/**
 * Create a TanStack text adapter for OpenAI-compatible or Anthropic APIs.
 *
 * OpenAI-compatible providers (DeepSeek, Ollama, OpenRouter, gateways) use the
 * Chat Completions API (`/chat/completions`), not OpenAI's newer Responses API.
 */
export function createTextAdapter(config: ModelAdapterConfig): TextAdapterConfig {
  const { style, model, baseURL, apiKey } = config;

  const trimmedBaseURL = baseURL?.trim();
  if (!trimmedBaseURL) {
    throw new Error(
      `Model baseURL is required for style "${style}". Pass baseURL when registering the ModelProvider / creating the agent.`
    );
  }

  if (style === "anthropic") {
    if (!apiKey) {
      throw new Error("Anthropic style requires an API key (pass apiKey when registering the ModelProvider).");
    }
    return {
      adapter: createAnthropicChat(model as Parameters<typeof createAnthropicChat>[0], apiKey, {
        baseURL: trimmedBaseURL,
        dangerouslyAllowBrowser: true,
      }),
      model,
      modelStyle: "anthropic",
      reasoning: true,
      pricing: config.modelInfo?.pricing,
    };
  }

  const key = apiKey || "not-needed";
  const openaiConfig = { baseURL: trimmedBaseURL, maxRetries: 0 };

  if (shouldEchoReasoningContent(config.modelInfo)) {
    return {
      adapter: createReasoningChatCompletions(model, key, {
        ...openaiConfig,
      }) as AnyTextAdapter,
      model,
      modelStyle: "openai",
      reasoning: true,
      pricing: config.modelInfo?.pricing,
    };
  }

  return {
    adapter: createChatCompletions(model, key, {
      ...openaiConfig,
      dangerouslyAllowBrowser: true,
    }) as AnyTextAdapter,
    model,
    modelStyle: "openai",
    reasoning: shouldEchoReasoningContent(config.modelInfo),
    pricing: config.modelInfo?.pricing,
  };
}
