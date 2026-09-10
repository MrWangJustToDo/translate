## ADDED Requirements

### Requirement: Single unified event bus

`@my-agent/core` SHALL provide exactly one event mechanism, `AgentEventBus`, and MUST NOT expose parallel notification systems (domain-owned multicast emitters, a separate interceptor bus, or a global streaming-callback registry) as public APIs. All core notification paths (lifecycle telemetry, domain state, streaming output, extension UI, extension interception) SHALL route through `AgentEventBus`.

#### Scenario: No parallel notification systems remain

- **WHEN** a consumer inspects core's public event surface
- **THEN** the only event API is `AgentEventBus` (plus the `AgentSession` channel projection), and `AgentTelemetryBus`, `ExtensionEventBus`, per-domain public `Emitter`s, and the streaming-callback registry are absent

#### Scenario: Domain state flows through the bus

- **WHEN** todos, plan phase, usage, summary stream, or L1 agent state changes
- **THEN** the owning object emits a declared observer event on the scoped bus rather than a private emitter

### Requirement: Observer and interceptor dispatch modes

`AgentEventBus` SHALL provide exactly two dispatch modes on the same registry and type declarations: `emit` (observer) and `intercept` (interceptor). Observer dispatch MUST be synchronous, ordered by registration, fire-and-forget, and MUST contain listener errors so one listener cannot starve others. Interceptor dispatch MUST be asynchronous, ordered by registration, and MUST pass the same mutable event object to each interceptor so a later interceptor observes earlier mutations; each interceptor MUST be awaited; an interceptor that sets the cancel flag MUST immediately short-circuit the remaining interceptors; and dispatch MUST return the final event or its replacement value.

#### Scenario: Observer listener error is contained

- **WHEN** an observer listener throws while handling an emitted event and another observer is registered for the same event
- **THEN** the second observer still receives the event

#### Scenario: Interceptor short-circuits and replaces payload

- **WHEN** an interceptor sets the cancel flag or a denying result for `tool:before:<tool>`
- **THEN** the remaining interceptors are skipped and the interceptor's replacement value is returned

#### Scenario: Interceptor can await async work

- **WHEN** an interceptor returns a promise
- **THEN** the dispatch awaits it before invoking the next interceptor

#### Scenario: Later interceptor observes earlier mutation

- **WHEN** an interceptor mutates the shared event payload and does not cancel
- **THEN** the next interceptor receives the mutated event

#### Scenario: Collection uses intercept without cancellation

- **WHEN** a collect-style event such as `before_agent_start` is dispatched and every interceptor appends to the shared event without setting cancel
- **THEN** all interceptors run in order and the caller reads the fully collected value from the event

### Requirement: No additional dispatch modes

The system SHALL NOT introduce awaited-observer (waited broadcast), parallel fan-out, or around-waterfall (next-delegation) dispatch modes for `AgentEventBus`. Durability barriers and turn-close boundaries that would require a waited broadcast MUST NOT be routed through the event bus.

#### Scenario: Emission does not block on observers

- **WHEN** an observer event is emitted
- **THEN** the emitter does not await observer completion and continues synchronously

#### Scenario: Durability does not depend on the bus

- **WHEN** session persistence or a turn-close boundary needs completion guarantees
- **THEN** it is satisfied outside the event bus rather than by a waited-dispatch mode

### Requirement: Single global event type registry

The system SHALL define a single module-augmentable event map (`AgentEvents`) as the authoritative source of event names and payload types, and SHALL derive the event-name union and payload lookup from it. Adding an event SHALL require editing only this registry (plus its metadata), and emit/subscribe call sites SHALL be compile-time checked against it.

#### Scenario: Type map drives name and payload types

- **WHEN** a developer adds an entry to the `AgentEvents` map
- **THEN** `emit` and `on` accept that name with its exact payload type without editing any other type file

#### Scenario: Unknown event name is rejected

- **WHEN** a call site passes an event name absent from `AgentEvents`
- **THEN** the project fails to typecheck

### Requirement: Event metadata registry

Each event SHALL declare runtime metadata: its dispatch mode, its `AgentSession` channel (if projected), whether it carries a retained value, and interceptor pattern keys for tool hooks. The `AgentSession` projection MUST derive channel routing from this metadata rather than from hand-maintained per-channel wiring or a lifecycle include-list.

#### Scenario: Channel routing is declarative

- **WHEN** the session projection receives any scoped observer event
- **THEN** it delivers the event to the channel declared in that event's metadata, and no separate per-channel source subscription exists

#### Scenario: Tool interceptor pattern keys

- **WHEN** an extension subscribes to `tool:before:*`
- **THEN** it receives matching `tool:before:<specific-tool>` dispatches while a subscription to a different prefix does not

### Requirement: Wildcard subscription

`AgentEventBus` SHALL support a wildcard `"*"` subscription that receives every observer event in scope. Interceptor events MUST NOT participate in wildcard delivery. The Event→Log bridge SHALL be the only core wildcard consumer.

#### Scenario: Wildcard receives all observer events

- **WHEN** a listener subscribes with `"*"` on a scope
- **THEN** every observer event emitted in that scope, regardless of name, is delivered to it

#### Scenario: Interceptor events excluded from wildcard

- **WHEN** an interceptor event such as `tool:before:read_file` is dispatched
- **THEN** a `"*"` observer listener does not receive it

### Requirement: Retained event values

Events that carry current state SHALL declare a retained value provided by their owner. Subscribing to a retained event MUST synchronously deliver the current value once to the new subscriber, followed by subsequent updates. Retained values MUST replace per-consumer snapshot re-reads and post-command manual rebroadcasts.

#### Scenario: Late subscriber receives current value

- **WHEN** a subscriber subscribes to a retained event after the state has been set
- **THEN** it immediately receives the current value and later updates without any additional fetch

#### Scenario: No post-command rebroadcast needed

- **WHEN** a command mutates state that has a retained event (for example mode, extensions, or MCP servers)
- **THEN** subscribers observe the change through the retained event and no command-specific rebroadcast path exists

### Requirement: Scoped event routing

`AgentEventBus` SHALL support scopes keyed by agent/session identity, derived from a base bus. A root scope SHALL observe all events; a child scope SHALL observe only events belonging to its own identity and, for subagent events, its descendants. Routing MUST be handled by the bus and MUST NOT require consumers to compare `agentId`/`parentId` fields manually.

#### Scenario: Child scope isolation

- **WHEN** two agents each hold their own scope and one emits an observer event
- **THEN** only the emitting agent's scope subscribers receive it

#### Scenario: Subagent events reach the parent scope

- **WHEN** a subagent emits a `subagent:*` event
- **THEN** a subscriber on the parent scope receives it without manual parent-id comparison

### Requirement: Session channels are a declarative projection

The `AgentSession` channel layer SHALL be a projection over the scoped event bus: a single subscription to the scope, routed per event metadata, with `subscribe({channels})` acting as a filter. Channel names, payload shapes, the `{channel, payload, ts}` wire envelope, and `getSnapshot()` SHALL remain the external contract consumed by hosts.

#### Scenario: Channel filter still applies

- **WHEN** a host subscribes with `{channels: ["usage"]}`
- **THEN** it receives only events whose metadata maps to the `usage` channel

#### Scenario: Snapshot and events agree

- **WHEN** a host reads `getSnapshot()` and also subscribes to the corresponding channels
- **THEN** both report the same state with no separate rebroadcast or refetch required

### Requirement: Extension API backed by the unified bus

The extension-facing API SHALL keep its existing hook names and `ctx` shape (`registerInterceptor`, `events`, `ui`) while being backed by `AgentEventBus`. Interceptor registration MUST return a disposer that unregisters on extension teardown.

#### Scenario: Hook names unchanged

- **WHEN** an extension registers an interceptor for `tool:before:run_command`
- **THEN** it is invoked on the unified bus using the same hook name contract as before

#### Scenario: Teardown unregisters interceptors

- **WHEN** an extension is disabled or torn down
- **THEN** its registered interceptors and extension-UI state no longer affect the bus
