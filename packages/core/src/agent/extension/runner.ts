import { getEnv, hasCoreEnv } from "../../env.js";
import { createAgentEventBus } from "../agent-event-bus";

import { z } from "./extension-zod.js";

import type {
  ExtensionInstance,
  ExtensionAPI,
  ExtensionContext,
  ExtensionConfig,
  ExtensionToolDefinition,
  ExtensionCommand,
  InterceptableEvent,
  EventInterceptor,
  ExtensionEventBus,
  ExtensionUI,
  BeforeAgentStartEvent,
  ExtensionPromptAppends,
  ExtensionTurnContextSection,
  ExtensionContextProvider,
  ExtensionRegistrations,
  ExtensionInfo,
} from "./types.js";
import type { CoreEnv } from "../../env.js";
import type { EmitAgentTelemetryFn } from "../../runtime-types/agent-events.js";
import type { AgentEventBus } from "../agent-event-bus";
import type { AgentLog } from "../agent-log/agent-log.js";

// ============================================================================
// ExtensionEventBus implementation
// ============================================================================

/**
 * {@link ExtensionEventBus} backed by the unified {@link AgentEventBus}.
 * Interception (async, ordered, shared mutable event, cancel short-circuit) is
 * delegated to the unified bus's `intercept` mode; hook names are unchanged.
 */
class BusExtensionEventBus implements ExtensionEventBus {
  private readonly disposers = new Map<EventInterceptor<InterceptableEvent>, () => void>();

  constructor(private readonly bus: AgentEventBus) {}

  async emit<T extends InterceptableEvent>(event: T): Promise<T["defaultReturn"] | undefined> {
    return this.bus.intercept(event);
  }

  on<T extends InterceptableEvent>(type: string, handler: EventInterceptor<T>): () => void {
    const key = handler as EventInterceptor<InterceptableEvent>;
    const unsub = this.bus.onIntercept(type, handler);
    this.disposers.set(key, unsub);
    return () => {
      this.disposers.delete(key);
      unsub();
    };
  }

  off<T extends InterceptableEvent>(type: string, handler: EventInterceptor<T>): void {
    void type;
    const key = handler as EventInterceptor<InterceptableEvent>;
    const unsub = this.disposers.get(key);
    if (unsub) {
      this.disposers.delete(key);
      unsub();
    }
  }
}

// ============================================================================
// ExtensionUI implementation
// ============================================================================

class DefaultExtensionUI implements ExtensionUI {
  /** Retained status state so late subscribers can reconcile (e.g. after bootstrap). */
  private statusMap = new Map<string, string>();
  /** status key → owning extension id, so a disabled extension's status can be removed. */
  private statusOwners = new Map<string, string>();

  constructor(private readonly bus: AgentEventBus | null) {}

  /**
   * Publish an `extension:ui` observer event on the agent's scoped bus (the
   * session `extension-ui` channel projection consumes it). The internal
   * pub/sub registry is gone — the bus is the single mechanism.
   */
  notify(type: string, data: unknown): void {
    const payload = (typeof data === "object" && data !== null ? data : { data }) as Record<string, unknown>;
    this.bus?.emit("extension:ui", { type, ...payload } as never);
  }

  /**
   * Subscribe to one `extension:ui` notification type via the bus (facade over
   * `extension:ui` events; kept so `ctx.ui.subscribe` keeps its shape).
   */
  subscribe<T = unknown>(type: string, handler: (data: T) => void): () => void {
    if (!this.bus) return () => {};
    return this.bus.on("extension:ui", (event) => {
      if (event.payload.type === type) handler(event.payload as unknown as T);
    });
  }

  setStatus(key: string, text: string): void {
    // Retain the latest value so hosts that subscribe after the update can read it.
    this.statusMap.set(key, text);
    // Publish a `set-status` notification the host UI renders in its status bar.
    this.notify("set-status", { key, text });
  }

  /**
   * Record which extension owns a status key, then set it. Used by the runner
   * wrapper so a disabled extension's status can be cleared on teardown.
   */
  setStatusWithOwner(key: string, text: string, ownerId: string): void {
    this.statusOwners.set(key, ownerId);
    this.setStatus(key, text);
  }

  /**
   * Remove every status key owned by `ownerId` and notify the host, so a
   * disabled extension's footer state does not linger.
   */
  clearStatusByOwner(ownerId: string): void {
    for (const [key, owner] of this.statusOwners) {
      if (owner !== ownerId) continue;
      this.statusOwners.delete(key);
      this.statusMap.delete(key);
      // Empty text signals the host to remove the status entry.
      this.notify("set-status", { key, text: "" });
    }
  }

  /** Remove all status entries and notify the host. */
  clearAllStatus(): void {
    for (const key of this.statusMap.keys()) {
      this.statusMap.delete(key);
      this.notify("set-status", { key, text: "" });
    }
    this.statusOwners.clear();
  }

  getStatus(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.statusMap);
  }

  theme = {
    fg: (color: string, text: string): string => text,
  };
}

// ============================================================================
// ExtensionRunner
// ============================================================================

export interface ExtensionRunnerOptions {
  getEnvVar: (key: string) => string | undefined;
  onRegisterTool?: (def: ExtensionToolDefinition) => void;
  onRegisterCommand?: (cmd: ExtensionCommand) => void;
  /** Unregister a previously registered tool (used when disabling an extension). */
  onUnregisterTool?: (name: string) => void;
  /** Unregister a previously registered command (used when disabling an extension). */
  onUnregisterCommand?: (name: string) => void;
  /** Working directory (rootPath) injected into {@link ExtensionContext.cwd}. */
  cwd?: string;
  /**
   * Resolve the runtime CoreEnv to inject into {@link ExtensionContext.coreEnv}.
   * Defaults to the globally registered CoreEnv (`getEnv()`).
   */
  getCoreEnv?: () => CoreEnv;
  /**
   * Optional telemetry emitter. When provided, extension lifecycle failures
   * (activate / deactivate) are emitted as `agent:extension-error` so they
   * surface in AgentLog / lifecycle channels instead of being swallowed.
   */
  emitEvent?: EmitAgentTelemetryFn;
  /**
   * Scoped unified event bus backing extension interception. Defaults to a
   * standalone bus for hosts that build an {@link ExtensionRunner} without an agent.
   */
  eventBus?: AgentEventBus;
  /**
   * Optional agent log to converge extension logging into. When provided,
   * `ctx.logger` and turn-context provider failures are written as structured
   * `hooks` entries instead of raw console output (console stays as a fallback
   * for standalone runner usage without an agent log).
   */
  log?: AgentLog | null;
}

export class ExtensionRunner {
  private extensions: ExtensionInstance[] = [];
  private toolRegistry = new Map<string, ExtensionToolDefinition>();
  private commandRegistry = new Map<string, ExtensionCommand>();
  /** name → owning extension id, to unregister only the owner's artifact on disable. */
  private toolOwners = new Map<string, string>();
  private commandOwners = new Map<string, string>();
  /** Per-extension context injection (extension id → provider). */
  private contextProviders = new Map<string, ExtensionContextProvider>();
  /**
   * Persistent "this extension is disabled" notices keyed by extension id
   * (captured from a provider's `disabledContent` at disable time, since destroy
   * unsubscribes the provider). Cleared when the extension is re-enabled.
   */
  private disabledExtensionNotices = new Map<string, string>();
  private eventBus: BusExtensionEventBus;
  private ui: DefaultExtensionUI;
  private options: ExtensionRunnerOptions;

  constructor(options: ExtensionRunnerOptions) {
    this.options = options;
    const bus = options.eventBus ?? createAgentEventBus();
    this.eventBus = new BusExtensionEventBus(bus);
    this.ui = new DefaultExtensionUI(bus);
  }

  getEventBus(): ExtensionEventBus {
    return this.eventBus;
  }

  getUI(): ExtensionUI {
    return this.ui;
  }

  /**
   * Wrap the shared UI for a single extension so status writes are attributed
   * to that extension (used to clear its footer state when it is disabled).
   * All other UI surface (notify / subscribe / getStatus / theme) is shared.
   */
  private wrapUi(ownerId: string): ExtensionUI {
    return {
      notify: (type, data) => this.ui.notify(type, data),
      subscribe: (type, handler) => this.ui.subscribe(type, handler),
      setStatus: (key, text) => this.ui.setStatusWithOwner(key, text, ownerId),
      getStatus: () => this.ui.getStatus(),
      theme: this.ui.theme,
    };
  }

  /**
   * Emit `session:start` to registered interceptors (per-agent ExtensionEventBus).
   * Distinct from the telemetry `session:start` emitted via the unified bus —
   * this one is interceptable by extensions.
   */
  emitSessionStart(cwd: string, sessionId: string): void {
    // Fire-and-forget interception: interceptor errors must not surface as
    // unhandled rejections or break session bootstrap.
    this.eventBus
      .emit({
        type: "session:start",
        payload: { cwd, sessionId },
        defaultReturn: undefined,
      })
      .catch(() => {});
  }

  /**
   * Emit `session:shutdown` to registered interceptors before teardown.
   */
  emitSessionShutdown(sessionId: string): void {
    // Fire-and-forget interception: interceptor errors must not surface as
    // unhandled rejections or break teardown.
    this.eventBus
      .emit({
        type: "session:shutdown",
        payload: { sessionId },
        defaultReturn: undefined,
      })
      .catch(() => {});
  }

  getTools(): ExtensionToolDefinition[] {
    return Array.from(this.toolRegistry.values());
  }

  getCommands(): ExtensionCommand[] {
    return Array.from(this.commandRegistry.values());
  }

  getTool(name: string): ExtensionToolDefinition | undefined {
    return this.toolRegistry.get(name);
  }

  /**
   * Emit `before_agent_start` to each interceptor (observable event), then run
   * registered context providers. Returns per-extension turn-context sections.
   */
  async collectBeforeAgentStart(prompt: string, sessionId: string): Promise<ExtensionPromptAppends> {
    // Dispatch through intercept (shared mutable event, ordered, awaited);
    // handlers that append turn context do so on the event without cancelling.
    const event: BeforeAgentStartEvent = {
      type: "before_agent_start",
      payload: { prompt, sessionId },
      defaultReturn: undefined,
    };
    await this.eventBus.emit(event);

    // Each enabled extension with content becomes its own section (kind = id).
    const turnContextSections: ExtensionTurnContextSection[] = [];
    for (const [id, provider] of this.contextProviders) {
      try {
        const value = await provider.content?.();
        if (value?.trim()) turnContextSections.push({ id, content: value.trim() });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Converge into the agent log via the existing `agent:extension-error`
        // rule (error/system) rather than a bare console write; console stays
        // as a fallback for standalone runners without an emitter.
        if (this.options.emitEvent) {
          this.options.emitEvent("agent:extension-error", {
            extensionId: id,
            phase: "turn-context",
            error: message,
          });
        } else {
          this.writeExtensionLog("error", id, `turn context provider failed: ${message}`);
        }
      }
    }
    // Surface runtime-disabled extensions under the same tag so the model knows
    // their tools are gone (symmetric to the enable-side section). A disabled
    // extension's providers were already unsubscribed on destroy, so its id never
    // also appears above.
    for (const [id, notice] of this.disabledExtensionNotices) {
      if (notice?.trim()) turnContextSections.push({ id, content: notice.trim() });
    }

    return { turnContextSections };
  }

  async loadExtension(api: ExtensionAPI, config?: ExtensionConfig): Promise<ExtensionInstance> {
    const registrations: ExtensionRegistrations = {
      tools: [],
      commands: [],
      unsubInterceptors: [],
      unsubTurnContext: [],
    };
    const ctx = this.createContext(api, config, registrations);

    const instance: ExtensionInstance = {
      api,
      context: ctx,
      state: "inactive",
      registrations,
    };

    this.extensions.push(instance);

    try {
      await api.activate(ctx);
      instance.state = "active";
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Roll back any artifacts registered before the failure so a later re-enable
      // starts clean (no duplicate registrations).
      this.unregisterInstanceArtifacts(instance);
      instance.state = "error";
      instance.error = error;
      ctx.logger.error(`Failed to activate extension "${api.id}": ${error.message}`);
      this.options.emitEvent?.("agent:extension-error", {
        extensionId: api.id,
        phase: "activate",
        error: error.message,
      });
    }

    return instance;
  }

  async destroyExtension(instance: ExtensionInstance): Promise<void> {
    if (instance.api.deactivate) {
      try {
        await instance.api.deactivate();
      } catch (err) {
        // Do not swallow: surface deactivation failures for observability.
        const error = err instanceof Error ? err : new Error(String(err));
        this.options.emitEvent?.("agent:extension-error", {
          extensionId: instance.api.id,
          phase: "deactivate",
          error: error.message,
        });
      }
    }
    this.unregisterInstanceArtifacts(instance);
    // Clear any footer/status entries this extension wrote so they do not
    // linger after the extension is disabled (e.g. `LSP: typescript ready`).
    this.ui.clearStatusByOwner(instance.api.id);
    instance.state = "inactive";
  }

  async destroyAll(): Promise<void> {
    for (const instance of this.extensions) {
      await this.destroyExtension(instance);
    }
    this.extensions = [];
    this.toolRegistry.clear();
    this.commandRegistry.clear();
    this.toolOwners.clear();
    this.commandOwners.clear();
    this.contextProviders.clear();
    this.disabledExtensionNotices.clear();
    this.ui.clearAllStatus();
  }

  /** Read-only snapshot of loaded extensions for management commands. */
  getExtensionInfos(): ExtensionInfo[] {
    return this.extensions.map((instance) => ({
      id: instance.api.id,
      name: instance.api.name,
      version: instance.api.version,
      description: instance.api.description,
      enabled: instance.state === "active",
      state: instance.state,
      error: instance.error?.message,
      tools: [...instance.registrations.tools],
      // Expose whether each command has a secondary menu (getOptions) so the app
      // can treat pure-display commands (e.g. /lsp, /mcp) without an options menu.
      commands: instance.registrations.commands.map((name) => ({
        name,
        hasOptions: Boolean(this.commandRegistry.get(name)?.getOptions),
      })),
    }));
  }

  /**
   * Enable or disable an extension at runtime. Disabling deactivates it and unregisters
   * its tools/commands/interceptors/turn-context providers; enabling re-activates it.
   * Returns a result describing what happened.
   */
  async setEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; message: string }> {
    const instance = this.extensions.find((e) => e.api.id === id);
    if (!instance) return { ok: false, message: `Extension "${id}" not loaded` };

    const already = instance.state === "active";
    if (enabled && already) return { ok: true, message: `Extension "${id}" already enabled` };
    if (!enabled && !already) return { ok: true, message: `Extension "${id}" already disabled` };

    if (enabled) {
      try {
        await instance.api.activate(instance.context);
        instance.state = "active";
        instance.error = undefined;
        this.disabledExtensionNotices.delete(instance.api.id);
        return { ok: true, message: `Extension "${id}" enabled` };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // Roll back any artifacts registered before the failure.
        this.unregisterInstanceArtifacts(instance);
        instance.state = "error";
        instance.error = error;
        return { ok: false, message: `Failed to enable "${id}": ${error.message}` };
      }
    }

    // Capture the provider's disabledContent BEFORE destroy (destroy unsubscribes
    // it). Undefined/absent falls back to a generic notice so non-customizing
    // extensions stay informative; an empty string explicitly opts out.
    const provider = this.contextProviders.get(instance.api.id);
    const custom =
      provider?.disabledContent === undefined ? undefined : ((await provider.disabledContent()) ?? undefined);

    await this.destroyExtension(instance);
    const notice =
      custom === undefined
        ? `Extension "${instance.api.name ?? id}" is disabled — its tools and commands are unavailable.`
        : custom.trim();
    if (notice) this.disabledExtensionNotices.set(instance.api.id, notice);
    else this.disabledExtensionNotices.delete(instance.api.id);
    return { ok: true, message: `Extension "${id}" disabled` };
  }

  /**
   * Unregister all artifacts an extension registered during activate().
   * Tools/commands are removed from the registry and the host; interceptors and
   * turn-context providers are unsubscribed.
   */
  private unregisterInstanceArtifacts(instance: ExtensionInstance): void {
    for (const name of instance.registrations.tools) {
      // Only unregister when this extension still owns the artifact — a later extension
      // may have overwritten the same name, and we must not remove its registration.
      if (this.toolOwners.get(name) !== instance.api.id) continue;
      this.toolOwners.delete(name);
      this.toolRegistry.delete(name);
      this.options.onUnregisterTool?.(name);
    }
    for (const name of instance.registrations.commands) {
      if (this.commandOwners.get(name) !== instance.api.id) continue;
      this.commandOwners.delete(name);
      this.commandRegistry.delete(name);
      this.options.onUnregisterCommand?.(name);
    }
    for (const unsub of instance.registrations.unsubInterceptors) {
      unsub();
    }
    for (const unsub of instance.registrations.unsubTurnContext) {
      unsub();
    }
    // Clear in place (`.length = 0`) rather than reassigning: the `createContext`
    // closures reference `registrations` and may read/capture these arrays at call
    // time. Reassigning would silently desync re-enabled registrations from the
    // instance, leaking them on a later disable.
    instance.registrations.tools.length = 0;
    instance.registrations.commands.length = 0;
    instance.registrations.unsubInterceptors.length = 0;
    instance.registrations.unsubTurnContext.length = 0;
  }

  private createContext(
    api: ExtensionAPI,
    config?: ExtensionConfig,
    registrations?: ExtensionRegistrations
  ): ExtensionContext {
    return {
      id: api.id,
      env: this.resolveEnv(api.id, config?.config),
      z,
      cwd: this.options.cwd ?? "",
      coreEnv: this.resolveCoreEnv(),
      registerTool: (def: ExtensionToolDefinition) => {
        this.toolRegistry.set(def.name, def);
        this.toolOwners.set(def.name, api.id);
        registrations?.tools.push(def.name);
        this.options.onRegisterTool?.(def);
      },

      registerCommand: (cmd: ExtensionCommand) => {
        this.commandRegistry.set(cmd.name, cmd);
        this.commandOwners.set(cmd.name, api.id);
        registrations?.commands.push(cmd.name);
        this.options.onRegisterCommand?.(cmd);
      },

      registerInterceptor: <T extends InterceptableEvent>(
        eventType: string,
        handler: EventInterceptor<T>
      ): (() => void) => {
        const unsub = this.eventBus.on(eventType, handler);
        registrations?.unsubInterceptors.push(unsub);
        return unsub;
      },

      registerContextProvider: (provider: ExtensionContextProvider): (() => void) => {
        this.contextProviders.set(api.id, provider);
        const unsub = () => {
          if (this.contextProviders.get(api.id) === provider) this.contextProviders.delete(api.id);
        };
        registrations?.unsubTurnContext.push(unsub);
        return unsub;
      },

      events: this.eventBus,
      ui: this.wrapUi(api.id),

      logger: {
        info: (msg: string) => this.writeExtensionLog("info", api.id, msg),
        warn: (msg: string) => this.writeExtensionLog("warn", api.id, msg),
        error: (msg: string) => this.writeExtensionLog("error", api.id, msg),
      },
    };
  }

  /**
   * Converge extension logging into the agent log (`hooks` category) when one
   * is wired; fall back to console for standalone runner usage (validation
   * scripts, hosts that build an ExtensionRunner without an agent).
   */
  private writeExtensionLog(level: "info" | "warn" | "error", extensionId: string, msg: string): void {
    const message = `[extension:${extensionId}] ${msg}`;
    const log = this.options.log;
    if (log) {
      if (level === "error") log.error("hooks", message);
      else if (level === "warn") log.warn("hooks", message);
      else log.info("hooks", message);
      return;
    }
    if (level === "error") console.error(message);
    else if (level === "warn") console.warn(message);
    else console.log(message);
  }

  private resolveCoreEnv(): CoreEnv {
    // Prefer the explicitly injected provider; else the globally registered CoreEnv if present;
    // else a minimal non-throwing stub so extension construction never fails in hosts that
    // build an ExtensionRunner standalone (e.g. validation scripts).
    if (this.options.getCoreEnv) return this.options.getCoreEnv();
    if (hasCoreEnv()) return getEnv();
    return {
      rootPath: this.options.cwd ?? "",
      getPlatform: async () => "unknown",
      getArch: async () => "unknown",
      getEnv: async () => ({}),
      homedir: async () => "",
      fs: {
        readFile: async () => {
          throw new Error("CoreEnv not registered");
        },
        stat: async () => {
          throw new Error("CoreEnv not registered");
        },
        readdir: async () => {
          throw new Error("CoreEnv not registered");
        },
        writeFile: async () => {
          throw new Error("CoreEnv not registered");
        },
        mkdir: async () => {
          throw new Error("CoreEnv not registered");
        },
        exists: async () => {
          throw new Error("CoreEnv not registered");
        },
        remove: async () => {
          throw new Error("CoreEnv not registered");
        },
      },
      runCommand: async () => {
        throw new Error("CoreEnv not registered");
      },
      exec: async () => {
        throw new Error("CoreEnv not registered");
      },
      fetch: async () => {
        throw new Error("CoreEnv not registered");
      },
    };
  }

  private resolveEnv(apiId: string, extConfig?: Record<string, unknown>): Record<string, string> {
    const env: Record<string, string> = {};

    if (extConfig) {
      for (const [key, value] of Object.entries(extConfig)) {
        if (typeof value === "string") {
          env[key] = value;
        }
      }
    }

    const apiKey = this.options.getEnvVar(`${apiId.toUpperCase()}_API_KEY`);
    if (apiKey) {
      env["API_KEY"] = apiKey;
    }

    return env;
  }
}
