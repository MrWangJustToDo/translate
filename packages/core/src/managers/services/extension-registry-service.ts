/**
 * ExtensionRegistryService — the agent's extension / tool / integration
 * registration domain, extracted from ManagedAgent's "Tools / registries /
 * extensions" block.
 *
 * Owns: set-once integration managers (todo / MCP / skills), the extension
 * runner + loader pair, the in-memory extension command map, and the dynamic
 * tools provider used for approval checks. Tool registration mutates the
 * agent's live `tools` record in place (runners cache its identity), so the
 * caller passes the record plus invalidation callbacks per call.
 */

import { defineServerTool } from "../../agent/tools/runtime/define-tool.js";

import type {
  ExtensionCommand,
  ExtensionLoader,
  ExtensionRunner,
  ExtensionToolDefinition,
} from "../../agent/extension";
import type { McpManager } from "../../agent/mcp/manager.js";
import type { SkillRegistry } from "../../agent/skills";
import type { TodoManager } from "../../agent/todo";
import type { ToolsRecord } from "../../agent/tools/runtime/tools-record.js";

/** Callbacks the caller (ManagedAgent) supplies for tool registration. */
export interface ExtensionToolRegistrationContext {
  /** The agent's live tools record — mutated in place, identity is stable. */
  tools: ToolsRecord;
  /** Structured warn sink (agent log). */
  warn: (message: string) => void;
  /** Called after the tools record changes so cached runners re-resolve. */
  onToolsChanged: () => void;
}

export class ExtensionRegistryService {
  // Set-once integration managers
  private todo: TodoManager | null = null;
  private mcp: McpManager | null = null;
  private skills: SkillRegistry | null = null;

  // Extension runtime
  private runner: ExtensionRunner | null = null;
  private loader: ExtensionLoader | null = null;
  /** Commands registered via ExtensionContext (merged with runner commands on read). */
  private readonly commands = new Map<string, ExtensionCommand>();

  /** Dynamic tools provider (defaults to the agent's tools record). */
  private managedToolsProvider?: () => ToolsRecord;

  // ---------------------------------------------------------------------------
  // Integration managers (set-once)
  // ---------------------------------------------------------------------------

  setTodoManager(t: TodoManager): void {
    if (this.todo) return;
    this.todo = t;
  }

  getTodoManager(): TodoManager | null {
    return this.todo;
  }

  setMcpManager(m: McpManager): void {
    if (this.mcp) return;
    this.mcp = m;
  }

  getMcpManager(): McpManager | null {
    return this.mcp;
  }

  setSkillRegistry(t: SkillRegistry): void {
    if (this.skills) return;
    this.skills = t;
  }

  getSkillRegistry(): SkillRegistry | null {
    return this.skills;
  }

  // ---------------------------------------------------------------------------
  // Extension runner / loader
  // ---------------------------------------------------------------------------

  setExtensionRunner(runner: ExtensionRunner): void {
    this.runner = runner;
  }

  getExtensionRunner(): ExtensionRunner | null {
    return this.runner;
  }

  setExtensionLoader(loader: ExtensionLoader): void {
    this.loader = loader;
  }

  getExtensionLoader(): ExtensionLoader | null {
    return this.loader;
  }

  // ---------------------------------------------------------------------------
  // Extension commands
  // ---------------------------------------------------------------------------

  registerCommand(cmd: ExtensionCommand, warn: (message: string) => void): void {
    if (this.commands.has(cmd.name)) {
      warn(`Command "/${cmd.name}" already registered, overwriting`);
    }
    this.commands.set(cmd.name, cmd);
  }

  /** Unregister a command previously added by an extension (used when disabling). */
  unregisterExtensionCommand(name: string): void {
    this.commands.delete(name);
  }

  /** Runner-registered commands win; in-memory commands are the fallback. */
  getExtensionCommands(): ExtensionCommand[] {
    if (this.runner) {
      return this.runner.getCommands();
    }
    return Array.from(this.commands.values());
  }

  // ---------------------------------------------------------------------------
  // Extension tools
  // ---------------------------------------------------------------------------

  registerTool(def: ExtensionToolDefinition, ctx: ExtensionToolRegistrationContext): void {
    if (ctx.tools[def.name]) {
      ctx.warn(`Tool "${def.name}" already registered, overwriting`);
    }
    const serverTool = defineServerTool({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      outputSchema: def.outputSchema,
      lazy: def.lazy,
      execute: async (args, toolCtx) =>
        def.execute(args, {
          toolCallId: toolCtx.toolCallId,
          abortSignal: toolCtx.abortSignal,
        }),
      toUI: def.toUI,
      toModelOutput: def.toModelOutput,
    });
    (ctx.tools as Record<string, unknown>)[def.name] = serverTool;
    ctx.onToolsChanged();
  }

  /** Unregister a tool previously added by an extension (used when disabling). */
  unregisterExtensionTool(name: string, ctx: ExtensionToolRegistrationContext): void {
    if (name in ctx.tools) {
      delete (ctx.tools as Record<string, unknown>)[name];
      ctx.onToolsChanged();
    }
  }

  // ---------------------------------------------------------------------------
  // Dynamic tools provider
  // ---------------------------------------------------------------------------

  setManagedToolsProvider(provider: () => ToolsRecord): void {
    this.managedToolsProvider = provider;
  }

  getManagedToolsProvider(): (() => ToolsRecord) | undefined {
    return this.managedToolsProvider;
  }
}
