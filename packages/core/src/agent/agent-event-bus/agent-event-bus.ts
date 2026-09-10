import { Emitter } from "../../utils/emitter.js";

import type {
  AgentEvent,
  AgentEventBus,
  AgentEventListener,
  AgentEventMetaInput,
  AgentEventType,
  AgentEventWildcardListener,
  EventInterceptor,
  InterceptableEvent,
} from "./types.js";

// ============================================================================
// Scope node
// ============================================================================

/**
 * One node in the scope tree. Observer fan-out uses a per-node {@link Emitter}
 * (the synchronous multicast primitive); an event emitted at a node is delivered
 * to that node and every ancestor (so the root observes all, siblings stay
 * isolated, and subagent scopes up-flow to their parent).
 */
class EventBusScopeNode {
  readonly observers = new Emitter<Record<string, AgentEvent>>();
  readonly wildcards = new Set<AgentEventWildcardListener>();
  readonly interceptors: Array<{ pattern: string; handler: EventInterceptor<InterceptableEvent> }> = [];
  readonly retained = new Map<string, () => unknown>();

  constructor(
    readonly id: string,
    readonly parent: EventBusScopeNode | null
  ) {}
}

// ============================================================================
// Helpers
// ============================================================================

/** Match an interceptor key against a concrete event name (`prefix:*` supported). */
function interceptorMatches(pattern: string, name: string): boolean {
  if (pattern === name) return true;
  if (pattern.endsWith("*")) return name.startsWith(pattern.slice(0, -1));
  return false;
}

// ============================================================================
// DefaultAgentEventBus
// ============================================================================

/**
 * Unified event bus implementation. One registry, two dispatch modes:
 * - observer `emit` / `on` (synchronous, error-isolated, retained replay);
 * - interceptor `intercept` / `onIntercept` (async, ordered, shared mutable
 *   event, cancel short-circuit).
 */
export class DefaultAgentEventBus implements AgentEventBus {
  constructor(private readonly node: EventBusScopeNode) {}

  get scopeId(): string {
    return this.node.id;
  }

  // --------------------------------------------------------------------------
  // Observer mode
  // --------------------------------------------------------------------------

  on<T extends AgentEventType>(type: T, listener: AgentEventListener<T>, options?: { replay?: boolean }): () => void;
  on(type: "*", listener: AgentEventWildcardListener): () => void;
  on(
    type: AgentEventType | "*",
    listener: AgentEventListener | AgentEventWildcardListener,
    options?: { replay?: boolean }
  ): () => void {
    if (type === "*") {
      const wildcard = listener as AgentEventWildcardListener;
      this.node.wildcards.add(wildcard);
      return () => {
        this.node.wildcards.delete(wildcard);
      };
    }

    const typed = listener as AgentEventListener;
    const unsub = this.node.observers.on(type, typed);

    // Retained replay: late subscribers synchronously receive the current value.
    // Callers that reconcile retained values themselves opt out via `replay:false`.
    if (options?.replay !== false) {
      const provider = this.findRetained(type);
      if (provider) {
        typed(this.buildEvent(type, provider() as never));
      }
    }

    return unsub;
  }

  retainedValue<T extends AgentEventType>(type: T): AgentEvent<T>["payload"] | undefined {
    const provider = this.findRetained(type);
    return provider ? (provider() as AgentEvent<T>["payload"]) : undefined;
  }

  emit<T extends AgentEventType>(type: T, payload: AgentEvent<T>["payload"], meta?: AgentEventMetaInput): void {
    const event = this.buildEvent(type, payload, meta) as AgentEvent;
    for (let node: EventBusScopeNode | null = this.node; node; node = node.parent) {
      node.observers.emit(type, event);
      for (const listener of [...node.wildcards]) {
        try {
          listener(event);
        } catch {
          // Ignore wildcard listener errors
        }
      }
    }
  }

  retain<T extends AgentEventType>(type: T, provider: () => AgentEvent<T>["payload"]): () => void {
    const stored = provider as () => unknown;
    this.node.retained.set(type, stored);
    return () => {
      // Only clear if this node still owns the same provider.
      if (this.node.retained.get(type) === stored) this.node.retained.delete(type);
    };
  }

  scope(id: string): AgentEventBus {
    return new DefaultAgentEventBus(new EventBusScopeNode(id, this.node));
  }

  // --------------------------------------------------------------------------
  // Interceptor mode
  // --------------------------------------------------------------------------

  async intercept<T extends InterceptableEvent>(event: T): Promise<T["defaultReturn"] | undefined> {
    for (let node: EventBusScopeNode | null = this.node; node; node = node.parent) {
      for (const registration of node.interceptors) {
        if (!interceptorMatches(registration.pattern, event.type)) continue;
        const result = await registration.handler(event as InterceptableEvent);
        // `cancel` = return false or set `skipDefault`; stop the chain.
        if (result === false || (event as { skipDefault?: boolean }).skipDefault) {
          return undefined;
        }
      }
    }
    return (event as { defaultReturn?: T["defaultReturn"] }).defaultReturn;
  }

  onIntercept<T extends InterceptableEvent>(pattern: string, handler: EventInterceptor<T>): () => void {
    const registration = {
      pattern,
      handler: handler as EventInterceptor<InterceptableEvent>,
    };
    this.node.interceptors.push(registration);
    return () => {
      const index = this.node.interceptors.indexOf(registration);
      if (index >= 0) this.node.interceptors.splice(index, 1);
    };
  }

  hasInterceptors(name: string): boolean {
    for (let node: EventBusScopeNode | null = this.node; node; node = node.parent) {
      if (node.interceptors.some((registration) => interceptorMatches(registration.pattern, name))) {
        return true;
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private buildEvent<T extends AgentEventType>(
    type: T,
    payload: AgentEvent<T>["payload"],
    meta?: AgentEventMetaInput
  ): AgentEvent<T> {
    return {
      type,
      ts: Date.now(),
      agentId: meta?.agentId ?? this.node.id,
      ...(meta?.parentId !== undefined ? { parentId: meta.parentId } : {}),
      ...(meta?.sessionId !== undefined ? { sessionId: meta.sessionId } : {}),
      payload,
    } as AgentEvent<T>;
  }

  /** Nearest retained provider for `type`, walking this node up to the root. */
  private findRetained(type: string): (() => unknown) | undefined {
    for (let node: EventBusScopeNode | null = this.node; node; node = node.parent) {
      const provider = node.retained.get(type);
      if (provider) return provider;
    }
    return undefined;
  }
}

/** Create a root event bus (no parent scope). */
export function createAgentEventBus(id = "root"): AgentEventBus {
  return new DefaultAgentEventBus(new EventBusScopeNode(id, null));
}
