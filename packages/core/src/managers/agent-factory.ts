import { AgentLog } from "../agent/agent-log";
import { createCodeModeExtension } from "../agent/code-mode";
import { createCompactionConfig } from "../agent/compaction/types.js";
import { ExtensionLoader, ExtensionRunner, getDefaultExtensionDirs } from "../agent/extension";
import { createLspExtension } from "../agent/lsp";
import { createMcpExtension, type McpExtensionConfig } from "../agent/mcp";
import { McpManager } from "../agent/mcp/manager.js";
import { createMemoryExtension } from "../agent/memory/extension.js";
import { MemoryManager } from "../agent/memory/memory-manager.js";
import { SessionStore } from "../agent/persistence/session-store.js";
import { createCompletePlanTool, createCreatePlanTool, createUpdatePlanTool } from "../agent/plan/create-plan-tool.js";
import { loadAgentDoc } from "../agent/prompt/agent-doc-loader.js";
import { createSkillsExtension } from "../agent/skills/extension.js";
import { SkillRegistry } from "../agent/skills/skill-registry.js";
import { createTaskTool } from "../agent/subagent/task-tool.js";
import { TodoManager } from "../agent/todo";
import { createTodoTool } from "../agent/todo/todo-tool.js";
import { createTools, createWebfetchTool, createWebsearchTool } from "../agent/tools";
import { createAskUserTool } from "../agent/tools/ask-user-tool.js";
import { type ToolsRecord } from "../agent/tools/runtime/tools-record.js";
import { getEnv } from "../env.js";

import { ManagedAgent, type ManagedAgentConfig } from "./managed-agent.js";
import { resolveTextAdapterForManaged } from "./run-agent.js";

import type { AgentManager } from "./agent-manager.js";
import type { SessionBootstrapContext } from "./session-bootstrap-events.js";
import type { AgentEvent } from "./telemetry/agent-telemetry-bus.js";
import type { AnyServerTool } from "@tanstack/ai";

export interface BuildManagedAgentResult {
  managed: ManagedAgent;
  bootstrap?: SessionBootstrapContext;
}

export interface BuildManagedAgentOptions {
  config: ManagedAgentConfig;
  parentId?: string;
  manager: AgentManager;
  emit: (event: AgentEvent) => void;
  getDefaultSkillDirs: () => Promise<string[]>;
}

/**
 * Construct and wire a {@link ManagedAgent} (tools, skills, MCP, memory, extensions, session).
 * Registry and parent linking remain the caller's responsibility.
 */
export async function buildManagedAgent({
  config,
  parentId,
  manager,
  emit,
  getDefaultSkillDirs,
}: BuildManagedAgentOptions): Promise<BuildManagedAgentResult> {
  const {
    id: customId,
    modelInfo: explicitModelInfo,
    name,
    skillDirs,
    compaction,
    mcpConfigPath,
    ...restConfig
  } = config;

  const resolvedModelInfo = explicitModelInfo ?? null;
  const fsRootPath = getEnv().rootPath;
  const log = new AgentLog();
  const todoManager = parentId ? null : new TodoManager();

  const managed = new ManagedAgent(
    { ...restConfig, name },
    {
      id: customId,
      log,
      tools: {},
      todoManager,
      parentId,
    }
  );

  const toolsRecord: ToolsRecord = { ...(await createTools({ usage: managed.usage })) };
  managed.tools = toolsRecord;
  managed.resolveTextAdapter = () => resolveTextAdapterForManaged(managed);
  managed.dispatchEvent = emit;

  if (resolvedModelInfo) {
    managed.setModelInfo(resolvedModelInfo);
    if (resolvedModelInfo.pricing) {
      managed.usage.setPricing(resolvedModelInfo.pricing);
    }
    managed.usage.setCapabilities(resolvedModelInfo.capabilities);
  }

  managed.setLog(log);

  if (!parentId) {
    const docResult = await loadAgentDoc({
      rootPath: fsRootPath,
      filenames: config.agentDocFilenames,
      loadOverride: config.agentDocLoadOverride !== false,
    });
    if (docResult.content) {
      const instructions = docResult.overrideContent
        ? `${docResult.content}\n\n## Local Override\n\n${docResult.overrideContent}`
        : docResult.content;
      managed.setAgentDocContent(instructions, docResult.source);
    }
    if (docResult.notice) {
      log.debug("system", docResult.notice);
    }
  }

  if (!parentId && todoManager) {
    managed.setTodoManager(todoManager);
    toolsRecord.todo = createTodoTool({ todoManager });
    toolsRecord.webfetch = createWebfetchTool({ managed });
    toolsRecord.websearch = createWebsearchTool({ managed });
  }

  if (!parentId) {
    toolsRecord.ask_user = createAskUserTool();
    toolsRecord.create_plan = createCreatePlanTool({ getPlanMode: () => managed.planMode });
    toolsRecord.update_plan = createUpdatePlanTool({ getPlanMode: () => managed.planMode });
    toolsRecord.complete_plan = createCompletePlanTool({ getPlanMode: () => managed.planMode });
  }

  let skillRegistry: SkillRegistry | null = null;

  if (!parentId) {
    skillRegistry = new SkillRegistry({ rootPath: fsRootPath });
    managed.setSkillRegistry(skillRegistry);

    const dirsToLoad = skillDirs ?? (await getDefaultSkillDirs());
    await skillRegistry.loadFromDirectories(dirsToLoad);
    log.info("skill", `Loaded ${skillRegistry.size} skills from ${dirsToLoad.length} directories`);

    toolsRecord.task = createTaskTool({ parentAgentId: managed.id, manager });

    const compactionInput = { ...compaction };
    if (!compactionInput?.tokenThreshold && resolvedModelInfo?.contextWindow) {
      // NOTE: MAX_THRESHOLD caps the compaction trigger threshold, NOT the model's context window.
      // The model itself (e.g. DeepSeek V4 Flash) may support up to 1M tokens, but the UI
      // displays tokenLimit (== compaction tokenThreshold) — so users see e.g. "90%/400k"
      // instead of "36%/1M". The 400k cap is a deliberate middle ground: large-window
      // models (400k–1M) still compact well before deep-context attention degradation,
      // while windows <= 400k use their full size (times compactAtPercent). Increase or
      // remove this cap if you want the UI to show the real model context window.
      const MAX_THRESHOLD = 400_000;
      compactionInput.tokenThreshold = Math.min(resolvedModelInfo.contextWindow, MAX_THRESHOLD);
    }
    managed.setCompactionConfig(createCompactionConfig(compactionInput));

    // MCP data layer: created (but not connected) here — connection + tool
    // registration happens in the built-in MCP extension (loaded below), so MCP
    // participates in the unified extension lifecycle (enable/disable, activate/deactivate).
    const mcpManager = new McpManager();
    managed.setMcpManager(mcpManager);

    // Memory manager is always created when enabled (drives the per-turn
    // relevance query + extraction in MemoryService). The built-in Memory
    // extension (loaded below) wraps it for presentation: tools, index injection.
    if (config.memory !== false) {
      const memoryManager = new MemoryManager({ rootPath: fsRootPath });
      await memoryManager.initialize();
      managed.setMemoryManager(memoryManager);
      log.debug("memory", `Memory initialized, index: ${memoryManager.getIndexContent().length} bytes`);
    }
  }

  if (!parentId) {
    const extensionRunner = new ExtensionRunner({
      // Extensions access the environment primarily via ctx.coreEnv.getEnv() (async).
      // getEnvVar stays a sync best-effort hook for convenience fields like API keys.
      getEnvVar: () => undefined,
      onRegisterTool: (def) => managed.registerTool(def),
      onRegisterCommand: (cmd) => managed.registerCommand(cmd),
      onUnregisterTool: (name) => managed.unregisterExtensionTool(name),
      onUnregisterCommand: (name) => managed.unregisterExtensionCommand(name),
      cwd: fsRootPath,
      getCoreEnv: () => getEnv(),
      emitEvent: (type, data) => managed.emitEvent(type, data),
      // Converge extension logging (`ctx.logger`, turn-context provider
      // failures) into the agent's structured log.
      log,
    });
    managed.extensionRunner = extensionRunner;

    const extensionLoader = new ExtensionLoader();
    managed.extensionLoader = extensionLoader;

    const extensionDirs = await getDefaultExtensionDirs(config.extensionDirs);
    log.debug("system", "Extension search directories", { dirs: extensionDirs });

    const fromDisk = await extensionLoader.loadFromDirectories(extensionDirs);
    for (const err of fromDisk.errors) {
      log.warn("system", err.message);
    }
    for (const api of fromDisk.loaded) {
      const instance = await extensionRunner.loadExtension(api);
      // loadExtension is fail-open (state: "error" on activate failure);
      // log the real outcome instead of always claiming "loaded".
      if (instance.state === "active") {
        log.info("system", `Extension loaded from disk: ${api.id}`);
      } else {
        log.warn(
          "system",
          `Extension failed to activate from disk "${api.id}": ${instance.error?.message ?? "unknown"}`
        );
      }
    }

    if (config.extensions && config.extensions.length > 0) {
      for (const factory of config.extensions) {
        try {
          const api = await factory.create();
          await extensionRunner.loadExtension(api);
          log.info("system", `Extension loaded from config: ${api.id}`);
        } catch (err) {
          log.warn("system", `Failed to load extension from config: ${err}`);
        }
      }
    }

    // Built-in LSP extension (enabled unless explicitly disabled).
    if (config.lsp !== false) {
      try {
        // `config.lsp` may be `true`/undefined (defaults) or a fine-grained
        // LspExtensionConfig object ({ disabledTools, enableAll }).
        const lspOptions = typeof config.lsp === "object" && config.lsp !== null ? config.lsp : undefined;
        const api = createLspExtension(lspOptions);
        await extensionRunner.loadExtension(api);
        log.info("system", `Built-in extension loaded: ${api.id}`);
      } catch (err) {
        log.warn("system", `Failed to load built-in LSP extension: ${err}`);
      }
    }

    // Built-in Skills extension (enabled unless explicitly disabled).
    // `config.skills` may be `true`/undefined (defaults) or a fine-grained
    // SkillsExtensionConfig object ({ toolsDisabled, indexDisabled }).
    if (config.skills !== false && skillRegistry) {
      try {
        const skillsConfig = typeof config.skills === "object" && config.skills !== null ? config.skills : undefined;
        const api = createSkillsExtension({ skillRegistry, config: skillsConfig });
        await extensionRunner.loadExtension(api);
        log.info("system", `Built-in extension loaded: ${api.id}`);
      } catch (err) {
        log.warn("system", `Failed to load built-in Skills extension: ${err}`);
      }
    }

    // Built-in Memory extension (enabled unless explicitly disabled).
    // `config.memory` may be `true`/undefined (defaults) or a fine-grained
    // MemoryExtensionConfig object ({ toolsDisabled, indexDisabled }).
    // The memory manager must be enabled too (MemoryService query depends on it).
    if (config.memory !== false) {
      try {
        const memoryManager = managed.getMemoryManager();
        if (memoryManager) {
          const memoryConfig = typeof config.memory === "object" && config.memory !== null ? config.memory : undefined;
          const api = createMemoryExtension({ memoryManager, config: memoryConfig });
          const instance = await extensionRunner.loadExtension(api);
          if (instance.state === "active") {
            log.info("system", `Built-in extension loaded: ${api.id}`);
          } else {
            log.warn(
              "system",
              `Built-in extension failed to activate "${api.id}": ${instance.error?.message ?? "unknown"}`
            );
          }
        }
      } catch (err) {
        log.warn("system", `Failed to load built-in Memory extension: ${err}`);
      }
    }

    // Built-in MCP extension (enabled unless explicitly disabled).
    // `config.mcp` may be `true`/undefined (defaults) or a fine-grained
    // McpExtensionConfig object ({ configPath }).
    if (config.mcp !== false) {
      try {
        const mcpManager = managed.getMcpManager();
        if (mcpManager) {
          const mcpConfig: McpExtensionConfig | undefined =
            typeof config.mcp === "object" && config.mcp !== null ? config.mcp : undefined;
          const api = createMcpExtension({ mcpManager, configPath: mcpConfig?.configPath ?? mcpConfigPath });
          const instance = await extensionRunner.loadExtension(api);
          if (instance.state === "active") {
            log.info("system", `Built-in extension loaded: ${api.id}`);
          } else {
            log.warn(
              "system",
              `Built-in extension failed to activate "${api.id}": ${instance.error?.message ?? "unknown"}`
            );
          }
        }
      } catch (err) {
        log.warn("system", `Failed to load built-in MCP extension: ${err}`);
      }
    }

    // Built-in Code Mode extension (enabled unless explicitly disabled).
    // Curated external_* tool subset exposed to the sandbox: read-only fs tools
    // eager, shell + websearch lazy (kept out of the system prompt's full type
    // stubs, discovered on demand). The extension feature-detects the host's
    // `createIsolateDriver` capability and degrades gracefully when absent.
    if (config.codeMode !== false) {
      try {
        const codeModeConfig =
          typeof config.codeMode === "object" && config.codeMode !== null ? config.codeMode : undefined;
        const eagerNames = ["read_file", "grep", "glob", "list_file", "tree"];
        const lazyNames = ["run_command", "websearch"];
        const curated = [...eagerNames, ...lazyNames]
          .map((name) => managed.tools[name])
          .filter((t): t is AnyServerTool => Boolean(t && "execute" in t));
        const api = createCodeModeExtension({
          tools: curated,
          lazyToolNames: lazyNames,
          timeout: codeModeConfig?.timeout,
          memoryLimit: codeModeConfig?.memoryLimit,
          lazyToolsConfig: codeModeConfig?.lazyToolsConfig,
        });
        const instance = await extensionRunner.loadExtension(api);
        if (instance.state === "active") {
          log.info("system", `Built-in extension loaded: ${api.id}`);
        } else {
          log.warn(
            "system",
            `Built-in extension failed to activate "${api.id}": ${instance.error?.message ?? "unknown"}`
          );
        }
      } catch (err) {
        log.warn("system", `Failed to load built-in Code Mode extension: ${err}`);
      }
    }
  }

  if (!parentId) {
    const sessionStore = new SessionStore();
    managed.setSessionStore(sessionStore, {
      modelStyle: config.modelStyle ?? resolvedModelInfo?.style ?? "openai",
      model: restConfig.model,
    });
  }

  managed.name = name;

  let bootstrap: SessionBootstrapContext | undefined;
  if (!parentId) {
    bootstrap = { cwd: fsRootPath };
  }

  return { managed, bootstrap };
}
