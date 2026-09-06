import { toolDefinition, type InferSchemaType, type SchemaInput, type ServerTool, type ClientTool } from "@tanstack/ai";

import { toModelOutputRegistry, type ModelToolContent, type ToModelOutputContext } from "./to-model-output-registry.js";
import { registerToUI } from "./to-ui-registry.js";

// ============================================================================
// Tool execute context (maps TanStack ToolExecutionContext)
// ============================================================================

export interface ToolExecuteCtx {
  toolCallId: string;
  abortSignal?: AbortSignal;
  /** Managed agent id from {@link ToolRunContext} when available. */
  agentId?: string;
}

export type { ModelToolContent, ToModelOutputContext };
export { toModelOutputRegistry };

// ============================================================================
// Factories
// ============================================================================

/**
 * Define a TanStack server tool with a stable {@link ToolExecuteCtx} shape.
 */
export function defineServerTool<
  TInput extends SchemaInput,
  TOutput extends SchemaInput,
  const TName extends string,
>(config: {
  name: TName;
  description: string;
  inputSchema?: TInput;
  outputSchema?: TOutput;
  needsApproval?: boolean;
  /**
   * Lazy tools are excluded from the initial request; the model discovers them
   * by name via the synthetic `__lazy__tool__discovery__` tool and gets the full
   * schema on demand. Keeps low-usage tools available without per-turn token cost.
   */
  lazy?: boolean;
  execute: (
    args: InferSchemaType<TInput>,
    ctx: ToolExecuteCtx
  ) => Promise<InferSchemaType<TOutput>> | InferSchemaType<TOutput>;
  /**
   * Format the persisted tool output for the LLM wire.
   *
   * MUST be a pure function of the persisted output: the tool-compact cache is
   * cleared on session restore (`restoreManagedSession`), after which history
   * tool messages are re-derived. Any non-deterministic content (timestamps,
   * random truncation, wall-clock state) would silently change the wire prefix
   * and invalidate prompt cache for restored sessions.
   */
  toModelOutput?: (
    ctx: ToModelOutputContext & { input: InferSchemaType<TInput>; output: InferSchemaType<TOutput> }
  ) => Promise<ModelToolContent> | ModelToolContent;
  toUI?: (result: InferSchemaType<TOutput>) => string;
}): ServerTool<TInput, TOutput, TName> {
  if (config.toModelOutput) {
    const toModel = config.toModelOutput;
    toModelOutputRegistry.register(config.name, (ctx) =>
      toModel({
        toolCallId: ctx.toolCallId,
        input: ctx.input as InferSchemaType<TInput>,
        output: ctx.output as InferSchemaType<TOutput>,
      })
    );
  }

  if (config.toUI) {
    registerToUI(config.name, config.toUI as (result: unknown) => string);
  }

  return toolDefinition({
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    needsApproval: config.needsApproval,
    lazy: config.lazy,
  }).server(async (args, ctx) => {
    const runContext = ctx?.context as { agentId?: string } | undefined;
    return config.execute(args, {
      toolCallId: ctx?.toolCallId ?? "",
      abortSignal: ctx?.abortSignal,
      agentId: runContext?.agentId,
    });
  }) as ServerTool<TInput, TOutput, TName>;
}

/**
 * Define a TanStack client tool (no server execute; UI supplies output).
 */
export function defineClientTool<
  TInput extends SchemaInput,
  TOutput extends SchemaInput,
  const TName extends string,
>(config: {
  name: TName;
  description: string;
  inputSchema?: TInput;
  outputSchema?: TOutput;
  needsApproval?: boolean;
  /** See {@link defineServerTool} `lazy` — lazy client tools are discovered on demand. */
  lazy?: boolean;
}): ClientTool<TInput, TOutput, TName> {
  return toolDefinition({
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    needsApproval: config.needsApproval,
    lazy: config.lazy,
  }).client() as ClientTool<TInput, TOutput, TName>;
}
