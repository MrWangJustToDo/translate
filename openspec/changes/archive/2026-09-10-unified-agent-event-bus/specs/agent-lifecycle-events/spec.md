## MODIFIED Requirements

### Requirement: Lifecycle tool events are independent of extensions

The system SHALL emit `agent:tool-start` before each tool invocation and SHALL emit exactly one of `agent:tool-end` or `agent:tool-error` after each tool invocation as observer events on the unified `AgentEventBus`, whether or not an `ExtensionRunner` is present. Interceptor handlers MUST NOT gate lifecycle tool event emission.

#### Scenario: Tool completes without extension runner

- **WHEN** a tool finishes successfully and no `ExtensionRunner` is configured
- **THEN** the `AgentEventBus` receives `agent:tool-start` followed by `agent:tool-end` with `tool_name` and duration metadata

#### Scenario: Tool fails without extension runner

- **WHEN** a tool throws or returns an error path and no `ExtensionRunner` is configured
- **THEN** the `AgentEventBus` receives `agent:tool-start` followed by `agent:tool-error` with error text

#### Scenario: Extension deny still emits lifecycle start

- **WHEN** an extension sets skip/deny on `tool:before:*`
- **THEN** `agent:tool-start` has already been emitted as an observer event on the `AgentEventBus` before interception completes

### Requirement: Architecture docs describe extension observation model

`packages/core/ARCHITECTURE.md` SHALL describe the current middleware stack (`extensions-middleware`), SHALL NOT document `.agent-hooks` / HookRegistry as supported customization, and SHALL document the unified `AgentEventBus` model (single registry with observer `emit` and interceptor `intercept` dispatch modes, retained values, scoped routing, and the `AgentSession` channel projection) instead of the former dual-bus split.

#### Scenario: Doc middleware list matches buildAgentRunner

- **WHEN** a reader follows ARCHITECTURE §3.3 middleware order
- **THEN** the listed stack matches `buildAgentRunner` in `run-agent.ts`, ending with extensions middleware rather than hooks middleware

#### Scenario: Doc describes the unified bus

- **WHEN** a reader follows the ARCHITECTURE event-model section
- **THEN** it documents one `AgentEventBus` with observer and interceptor modes and the session channel projection, and does not describe `AgentTelemetryBus` and `ExtensionEventBus` as separate systems
