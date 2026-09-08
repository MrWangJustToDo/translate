# agent-log-timeline

## ADDED Requirements

### Requirement: Log core is persistence-only

`AgentLog` SHALL be a persistence-only timeline writer: every accepted entry is written to the attached file sink and nothing else. It MUST NOT maintain an in-memory entries ring or expose query APIs (`getEntries`, `getCount`, `filter`, `recent`, `errors`, `issues`), console output (`toConsole`), or serialization helpers (`toJSON`, `fromJSON`, `toString`). The file sink receives entries directly (no event-subscription indirection) and remains the only consumer of log entries.

#### Scenario: No in-memory accumulation
- **WHEN** a long-running session produces more entries than any fixed buffer size
- **THEN** the log object's memory footprint stays constant (only the pending sink flush buffer grows transiently) and all entries are present in the JSONL file

### Requirement: No UI debug log channel

The agent session MUST NOT expose a `log` event channel to clients, and the app layer MUST NOT subscribe to or render log entries: the `use-agent-log` store, `bindSessionLog`, the `Debug` panel, and the `useAgentLog` adapter hook SHALL be removed. Log observability is provided exclusively by the persisted JSONL file.

#### Scenario: Session events contain no log channel
- **WHEN** a client subscribes to session SSE events (all channels)
- **THEN** no `channel: "log"` frames are ever delivered

#### Scenario: Debug panel is gone
- **WHEN** the app UI is rendered
- **THEN** no Debug panel/log view component exists and the adapter hooks type has no `useAgentLog` member

### Requirement: Hook-call echo logging is opt-in only

The middleware instrumentation layer (`instrument-middleware-log.ts`) MUST NOT write `middleware:{name}:{hook}` entries to `AgentLog` by default. Hook-call echoes SHALL only be recorded when explicitly enabled via the `MY_AGENT_LOG_HOOKS` environment flag. Lifecycle and business events MUST NOT depend on this flag.

#### Scenario: Default pipeline produces no hook echoes
- **WHEN** an agent run executes tools and LLM iterations with `MY_AGENT_LOG_HOOKS` unset
- **THEN** the persisted log contains zero entries matching `middleware:{name}:{hook}`

#### Scenario: Debug mode restores hook echoes
- **WHEN** `MY_AGENT_LOG_HOOKS` is set to a truthy value
- **THEN** middleware hook invocations are logged as before (debug level, `hooks` category)

### Requirement: Large tool payloads are summarized, not dumped

The Event→Log bridge MUST NOT inline full `tool_input`, `tool_output`, or approval `tool_input` payloads into log entries. Tool lifecycle and approval entries SHALL carry `inputBytes` / `outputBytes` numeric fields plus a truncated preview of at most 200 characters. Full tool output remains available via the existing tool-output cache path, which MAY be referenced by `outputPath` when present.

#### Scenario: Tool end entry records size and preview
- **WHEN** a `read_file` tool call returns a 40KB file content
- **THEN** the resulting `tool` category log entry contains `outputBytes` equal to the serialized size and a `outputPreview` string no longer than 200 characters, and the full content does not appear in the log entry

#### Scenario: Approval request does not inline input
- **WHEN** an approval is requested for a tool with a large input
- **THEN** the `approval` category entry contains `inputBytes` and a preview, not the full input object

### Requirement: Bootstrap logging is single-sourced

Session bootstrap information (instructions loaded, skills loaded, memory initialized, extensions activated, session start) SHALL be recorded exactly once per launch: via the `session:*` lifecycle events through the Event→Log bridge. Direct `log.*` calls in `agent-factory.ts` that duplicate these events MUST be removed, replaced by at most one aggregated bootstrap summary entry.

#### Scenario: One bootstrap does not duplicate skill/memory lines
- **WHEN** a new agent session boots with N skills and M memories
- **THEN** the log contains the `session:skill` / `session:memory` / `session:start` bridged entries and no duplicate direct `system`-category entries for the same facts

### Requirement: Per-turn memory debug streams are silent

Memory prefetch, extraction, and consolidation `start`/`empty`/`skip` outcomes MUST NOT produce log entries at debug level. Memory errors and warnings (warn/error level) SHALL still be logged.

#### Scenario: Turn with no matching memories logs nothing
- **WHEN** a user turn triggers memory prefetch that selects zero memories
- **THEN** no `memory` category entry is written for that turn

### Requirement: LLM timeline entries carry cost and latency metrics

`llm:request` entries SHALL include `model` and `iteration`. `llm:response` entries SHALL include `model`, `iteration`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, `costUsd`, `roundElapsedMs`, `firstTokenMs`, and `finishReason`. Cost is sourced from the existing usage tracker cost accumulation; `firstTokenMs` is measured from LLM request start to the first received stream chunk.

#### Scenario: Response entry enables cost analysis
- **WHEN** an LLM iteration finishes with token usage
- **THEN** the `llm:response` entry allows computing per-call cost (costUsd), generation latency (firstTokenMs, roundElapsedMs), and reasoning share (reasoningTokens) without any other data source

### Requirement: Status transitions are logged

`AgentStatusController` SHALL write one log entry per agent status transition (category `agent`, carrying `from`, `to`, and a trigger hint) so the run's state machine is reconstructable from the log alone.

#### Scenario: Run start transition is visible
- **WHEN** the controller moves the agent from `idle` to `running` and later to `responding`
- **THEN** each transition produces an entry with `from: "idle", to: "running"` and `from: "running", to: "responding"` respectively

### Requirement: Approval resolutions are logged

When an approval is resolved (approved or denied, including command-safety auto-decisions), the system SHALL emit an `agent:tool-approval-resolved` lifecycle event carrying `tool_name`, `decision` (`approved` | `denied`), and `reason` when available, which the Event→Log bridge turns into one `approval` category entry.

#### Scenario: User approves a tool
- **WHEN** the user approves a pending tool call
- **THEN** one `approval` entry records `decision: "approved"` for that tool call id, in addition to the original request entry

### Requirement: Subagent completion carries run statistics

`subagent:completed` lifecycle events SHALL include `iterations`, `durationMs`, and a `usage` snapshot from the subagent run result, so the Event→Log entry records quantitative outcome in addition to the summary text.

#### Scenario: Completed subagent logs stats
- **WHEN** a subagent finishes after 3 iterations and 12 seconds
- **THEN** the bridged log entry contains `iterations: 3` and `durationMs` approximately 12000

### Requirement: Log entries are run-scoped

Every log entry written during an agent run SHALL carry a `run` field: a short run identifier stable for the duration of that run, enabling per-run slicing of the JSONL timeline. Entries written outside a run (bootstrap, idle-time operations) MAY omit `run`.

#### Scenario: Timeline slices by run
- **WHEN** a session log contains two consecutive runs
- **THEN** all entries of the first run share one `run` id, all entries of the second run share a different `run` id, and `turn:summary` closes each run's slice

### Requirement: Turn summary is the canonical run outcome record

The `turn:summary` entry written at run finalization SHALL include: LLM call count, tool call count, input/output/cache token totals for the run, run cost in USD, total run duration, and the finish outcome (`finished` | `aborted` | `error`).

#### Scenario: Finished run summary is self-sufficient
- **WHEN** a run completes normally
- **THEN** the final `chat` category summary entry answers "how long, how many calls, how many tokens, what cost, what outcome" without cross-referencing other entries
