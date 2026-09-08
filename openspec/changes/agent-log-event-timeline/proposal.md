# Agent Log Event Timeline

## Why

Agent log persistence (`.agents/logs/{sessionId}/agent.log`) currently produces low-value data: ~80% of entries are `middleware:{name}:{hook}` debug echoes with no business payload, and large-payload events (`agent:tool-start/end`, `agent:tool-approval-request`) dump full `tool_input`/`tool_output` into the log (72% of file bytes in sampled 1MB logs). Meanwhile the observability fields that actually matter — cost, reasoning tokens, first-token latency, iteration index, tool output size, status transitions, approval resolutions, subagent run stats — are computed in the code but never logged. The signal-to-noise ratio is roughly 1:10.

## What Changes

- **Remove hook-call echo logging**: drop `instrument-middleware-log.ts` full-coverage `middleware:{name}:{hook}` debug entries from the default pipeline (kept behind an opt-in env flag for debugging).
- **Stop full payload dumping in the telemetry→log bridge**: `event-log-bridge.ts` replaces raw `{...payload}` propagation with size + truncated preview for `tool_input`/`tool_output`; remove redundant `eventType` field.
- **Deduplicate bootstrap logging**: remove direct `agent-factory.ts` bootstrap writes that overlap `emitSessionBootstrapEvents` (`session:doc/skill/memory/start`); collapse per-extension load lines into one summary entry.
- **Silence per-turn memory debug streams**: memory prefetch/extract/consolidate `start/empty` debug entries are no longer logged (errors/warns stay).
- **Enrich the event timeline with missing metrics**:
  - `llm:request`/`llm:response`: add `iteration`, `model`, `roundElapsedMs`; `llm:response` additionally gains `costUsd`, `reasoningTokens`, `firstTokenMs`.
  - `agent:tool-end`: add `outputBytes`; `agent:tool-start`: add `inputBytes`.
  - New `status:changed` entries from `AgentStatusController.setStatus` (from → to + trigger).
  - New approval resolution entries (`approved` / `denied` + reason) where approvals are resolved.
  - `subagent:completed` carries `iterations` / `durationMs` / `usage` from the run result.
  - `turn:summary` upgraded to the canonical run-outcome record (LLM calls, tool calls, tokens, cost, duration).
- **Run-scoped timeline**: every log entry gains an optional `run` short-id so the JSONL file can be sliced per agent run.
- **BREAKING — collapse `AgentLog` to a persistence-only timeline writer**: remove the in-memory entries ring (10k cap), the query API (`getEntries`/`getCount`/`filter`/`recent`/`errors`/`issues`), `toConsole`, `toJSON`/`fromJSON`/`toString`, and the `clear()`/`setMaxEntries` surface; entries stream straight to the file sink. None of these have external callers.
- **BREAKING — remove the UI debug log channel chain**: the session `log` channel forwarding (`local-agent-session.ts`), the app-side `use-agent-log` store + `bindSessionLog`, the `Debug.tsx` panel, and `AdapterHooks.useAgentLog` are deleted — the file sink is the only log consumer.
- **Preserve boundaries**: session journal (`.session.log`) and `.session.json` remain the data-persistence layer and are unchanged; tool outputs referenced by path (`.agents/cache/tool-output/`) instead of inlined.

## Capabilities

### New Capabilities
- `agent-log-timeline`: contract for the persisted agent log event timeline — which events must appear, with which structured fields, size/preview limits for large payloads, run-scoping, and noise exclusions.

### Modified Capabilities
- `agent-lifecycle-events`: Event→Log bridging requirements change — the wildcard bridge must log lifecycle events with summarized payloads (size + preview, no full dump), bootstrap events are single-sourced, and memory debug events are excluded.

Note: the removed session `log` channel / Debug panel has no existing spec coverage (the SSE `remote-session-transport` spec defines channels generically and does not enumerate `log`), so its removal needs no delta spec — it is covered by the new `agent-log-timeline` requirements below.

## Impact

- **Packages**: `@my-agent/core` (agent-log types, managers middleware/controllers, telemetry bridge, agent-session log channel) and `@my-agent/app` (hook/panel removal) + playground call-site updates (hook injection). No wire-format changes otherwise: `LogEntry` gains additive optional fields.
- **Code**: `agent-log/types.ts`, `event-log-bridge.ts`, `event-log-rules.ts`, `instrument-middleware-log.ts` (default-off), `agent-factory.ts`, `lifecycle-middleware.ts`, `extensions-middleware.ts`, `agent-status-controller.ts`, `agent-chat-controller.ts`, `run-subagent.ts`, `usage-tracker.ts` (expose cost snapshot).
- **Behavior**: log files shrink ~85%+; default min-level stays `debug` since remaining debug entries are meaningful.
- **Validation**: new `validate:agent-log-timeline` script following the repo's `validate-*` convention.
