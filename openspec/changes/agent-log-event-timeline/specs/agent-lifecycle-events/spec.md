# agent-lifecycle-events — Delta

## ADDED Requirements

### Requirement: Approval resolution emits lifecycle event

The system SHALL emit `agent:tool-approval-resolved` on the AgentEventBus exactly once per pending approval when it is resolved — whether by user decision or by command-safety auto-decision. The event payload SHALL include `tool_call_id`, `tool_name`, `decision` (`approved` | `denied`), and `reason` when a reason exists. The Event→Log bridge SHALL be the sole core path that turns this event into an `approval` category log entry.

#### Scenario: Command-safety auto-deny emits resolution
- **WHEN** command-safety automatically denies a shell command tool call
- **THEN** `agent:tool-approval-resolved` is emitted with `decision: "denied"` and a reason, and one bridged `approval` log entry is written

#### Scenario: No resolution event for already-resolved approvals
- **WHEN** a resolution arrives for a tool call that has no pending approval
- **THEN** no `agent:tool-approval-resolved` event is emitted

## MODIFIED Requirements

### Requirement: Subagent completed payload includes summary

When a subagent run finishes successfully, the system SHALL emit `subagent:completed` with a `summary` field (string) suitable for Event→Log formatting, plus `iterations` (number), `durationMs` (number), and `usage` (token usage snapshot from the subagent run result). Event→Log SHALL prefer `event.data.summary` when composing the log message and SHALL include the run statistics in the entry data.

#### Scenario: Completed subagent logs summary text
- **WHEN** a subagent completes with a non-empty summary string
- **THEN** `subagent:completed` data includes `summary` and the Event→Log message includes that summary text rather than a placeholder such as “(no summary)”

#### Scenario: Completed subagent logs run statistics
- **WHEN** a subagent completes after 3 iterations, 12 seconds, with recorded token usage
- **THEN** `subagent:completed` data includes `iterations: 3`, a `durationMs` of approximately 12000, and a `usage` object, and the bridged log entry carries these fields
