# agent-lifecycle-events

## Purpose

AgentEventBus lifecycle notifications: emission contracts, payload shapes, relationship to ExtensionEventBus, and Event→Log as the sole core wildcard consumer.
## Requirements
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

### Requirement: Compaction start events match compaction kind

The system SHALL emit `compaction:auto-start` only for auto-compaction and `compaction:reactive-start` only for reactive compaction. A reactive compact attempt MUST NOT also emit `compaction:auto-start`.

#### Scenario: Auto compact start
- **WHEN** auto-compaction begins because the token threshold is exceeded
- **THEN** the AgentEventBus emits `compaction:auto-start` and does not emit `compaction:reactive-start`

#### Scenario: Reactive compact start
- **WHEN** reactive compaction begins after a `prompt_too_long` recovery path
- **THEN** the AgentEventBus emits `compaction:reactive-start` exactly once for that attempt and does not emit `compaction:auto-start`

### Requirement: Session restore and subagent destroy emit lifecycle events

The system SHALL emit `session:restore` after a session is successfully restored onto a managed agent. The system SHALL emit `subagent:destroyed` when a subagent managed agent is destroyed or auto-destroyed.

#### Scenario: Resume session emits restore
- **WHEN** `ManagedAgent.restoreSession` successfully loads session data
- **THEN** the AgentEventBus emits `session:restore` with the session id in the event data

#### Scenario: Destroy subagent emits destroyed
- **WHEN** a subagent is removed via destroy / autoDestroy
- **THEN** the AgentEventBus emits `subagent:destroyed` for that subagent id

### Requirement: Approval requests log only via Event→Log

When tool approvals become pending, the system SHALL emit `agent:tool-approval-request` and MUST NOT also write a duplicate approval entry directly to `AgentLog` at the status-controller emit site. The Event→Log bridge SHALL be the sole core path that turns that event into a log entry.

#### Scenario: Approval pending produces one log path
- **WHEN** `syncApprovals` observes one or more tools needing approval
- **THEN** each pending tool causes an `agent:tool-approval-request` emission and the status controller does not call `log.approval` directly

### Requirement: Subagent completed payload includes summary

When a subagent run finishes successfully, the system SHALL emit `subagent:completed` with a `summary` field (string) suitable for Event→Log formatting. Event→Log SHALL prefer `event.data.summary` when composing the log message.

#### Scenario: Completed subagent logs summary text
- **WHEN** a subagent completes with a non-empty summary string
- **THEN** `subagent:completed` data includes `summary` and the Event→Log message includes that summary text rather than a placeholder such as “(no summary)”

### Requirement: Architecture docs describe extension observation model

`packages/core/ARCHITECTURE.md` SHALL describe the current middleware stack (`extensions-middleware`), SHALL NOT document `.agent-hooks` / HookRegistry as supported customization, and SHALL document the unified `AgentEventBus` model (single registry with observer `emit` and interceptor `intercept` dispatch modes, retained values, scoped routing, and the `AgentSession` channel projection) instead of the former dual-bus split.

#### Scenario: Doc middleware list matches buildAgentRunner

- **WHEN** a reader follows ARCHITECTURE §3.3 middleware order
- **THEN** the listed stack matches `buildAgentRunner` in `run-agent.ts`, ending with extensions middleware rather than hooks middleware

#### Scenario: Doc describes the unified bus

- **WHEN** a reader follows the ARCHITECTURE event-model section
- **THEN** it documents one `AgentEventBus` with observer and interceptor modes and the session channel projection, and does not describe `AgentTelemetryBus` and `ExtensionEventBus` as separate systems

