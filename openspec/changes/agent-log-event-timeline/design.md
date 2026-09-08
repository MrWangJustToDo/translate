# Design — Agent Log Event Timeline

## Context

`AgentLog` (packages/core/src/agent/agent-log/) is a per-ManagedAgent in-memory ring (10k entries) with a JSONL file sink (`.agents/logs/{sessionId}/agent.log`, 5MiB × 5 rotation, 250ms batch flush). Entries reach it via three paths: direct `log.*` calls, the telemetry bridge (`bridgeTelemetryToAgentLog` in agent-manager.ts:85-90 → event-log-bridge.ts), and the middleware instrument wrapper (`instrumentMiddlewareLog` in run-agent.ts:220). Sampling of production logs shows ~80% of entries are hook echoes and ~72% of bytes are full `tool_input`/`tool_output` dumps, while cost/latency/iteration/status-transition data is absent. The Event→Log bridge is already the sole wildcard consumer of the 47-event `AgentTelemetryBus` (per `agent-lifecycle-events` spec), so the refactor concentrates there rather than introducing a new pipeline.

Reference implementations consulted: opencode (observability logging with runID + tool-output store with preview/reference), gemini-cli (layered message log / debug logger / OTel), tanstack-ai & vercel-ai (span-style structured attributes).

## Goals / Non-Goals

**Goals:**
- Persisted log becomes a per-run event timeline: state transitions, aggregated metrics, errors.
- Remove hook echoes and full payload dumps from the default pipeline.
- Add the missing high-value fields (cost, reasoning tokens, first-token latency, iteration, I/O sizes, approval resolution, subagent stats).
- Keep `LogEntry` wire-compatible (additive optional fields).
- Collapse `AgentLog` to a persistence-only writer and remove the UI debug log channel chain (user decision: the in-memory debug surface has no remaining value).

**Non-Goals:**
- No changes to session persistence (journal `.session.log`, `.session.json`) — data vs. log boundary stays as-is.
- No OTel / external telemetry export.
- No log retention/pruning policy changes beyond the existing rotation.

## Decisions

### D1: Keep the three-path architecture; fix what each path writes (not a new log system)
The bridge + direct-call + instrument structure is sound; the noise is in what they write. Alternatives: (a) replace with a dedicated span/tracing system (rejected: large surface, no consumer today; OTel is a Non-Goal), (b) filter at sink level (rejected: hides noise instead of removing it, wastes memory ring entries).

### D2: Hook echoes move behind `MY_AGENT_LOG_HOOKS`
`instrumentMiddlewareLog` stays in the pipeline (it also normalizes async passthrough) but only writes when `process.env.MY_AGENT_LOG_HOOKS` is truthy, evaluated lazily per call so tests can toggle it. Alternative: delete the module — rejected because per-hook tracing was recently added deliberately (see memory `middleware-instrumentation-logging`) and is genuinely useful when debugging middleware ordering; opt-in preserves that.

### D3: Payload summarization lives in `event-log-bridge.ts`, not at each emit site
The bridge's `writeLog` currently spreads the whole payload into `data`. A single summarizer there (`summarizePayload`: pick known scalar fields, convert `tool_input`/`tool_output`/`input` to `{ inputBytes|outputBytes, preview ≤200 chars }`, drop `eventType`) fixes tool-start/end, approval-request, and task-prefork at once. Preview = first 200 chars of the JSON/string form. Alternative: per-middleware changes — rejected as scattered and easy to regress.

### D4: Cost/latency fields sourced from existing trackers, no new measurement plumbing
- `costUsd`: `UsageTracker` already computes cost per call in `accumulateTotal` (usage-tracker.ts:129-131); expose the last-call cost via the existing update return / a getter consumed by lifecycle-middleware `onUsage`/`onFinish`.
- `firstTokenMs`: lifecycle-middleware `onChunk` already detects `RUN_STARTED` and the first text/reasoning chunk (lifecycle-middleware.ts:51-69); record `roundStart` → first-chunk delta.
- `roundElapsedMs`: already computed for `addLlmCall` (lifecycle-middleware.ts:80-81); pass it into the finish log.
- `iteration`: TanStack ctx exposes it in middleware hooks; thread it into the two log calls in lifecycle-middleware.
No new timers elsewhere. First-token measurement for non-streaming providers degrades to ≈ roundElapsedMs (acceptable; noted in code comment).

### D5: Status transitions logged inside `AgentStatusController.setStatus`
Single choke point; every transition writes `agent` category entry `{from, to, trigger}`. Suppression rule: no entry when `to` equals current status (idempotent setStatus calls stay silent) to avoid chunk-driven repeats. Alternative: emit a new telemetry event and bridge it — rejected: status controller is core-internal, and the Event→Log spec positions the bridge for cross-cutting agent events, not internal UI-state plumbing; direct logging here does not violate the "sole wildcard consumer" contract (that contract covers agent events, and D7 adds an event only where one doesn't exist).

### D6: Run scoping via run-scoped sequential short id
`ManagedAgent` run lifecycle already has a single entry point (`prepareManagedAgentForRun`) and idempotent finalize; generate `run = randomId().slice(0,8)` there and store on the agent for the duration of the pump; `AgentLog.log()` picks it up through an explicit `run` field in entry data — implemented as a top-level optional `run` on `LogEntry` set by callers that know the run context (lifecycle/status/tool bridges receive it via the agent). Bootstrap/idle entries omit `run`. Alternative: timestamp-based slicing — rejected: fragile across session restore.

### D7: Approval resolution becomes a real lifecycle event
Add `agent:tool-approval-resolved` to `AgentEventType` + payload map (agent-events.ts / agent-event-payloads.ts, compile-time completeness check will enforce wiring), emit from the two resolution sites (user decision path agent-chat-controller.ts:238-245; command-safety auto-decision :556-605), bridge formats it. Reason strings are truncated by D3's summarizer. This fills the approval-timeline gap without touching the approval storage model.

### D8: Bootstrap dedupe — keep the event path, delete the direct calls
`emitSessionBootstrapEvents` (session-bootstrap-events.ts) already covers doc/skill/memory/start. Delete the overlapping direct `log.*` calls in agent-factory.ts (skills :135, memory :166, doc notice :109, extension loads :203-333) and add one aggregated `session:bootstrap` summary entry (counts only: skills N, extensions N, memories N, instructions bytes). Extension load *failures* keep individual warn entries.

### D9: Subagent stats ride the existing `subagent:completed` payload
`runSubagent` already returns `iterations/durationMs/usage/reachedLimit/incomplete` (run-subagent.ts:341-355); include them in the emit data instead of only summary text. No new event type.

### D10: Validation via script, consistent with repo convention
New `packages/core/scripts/validate-agent-log-timeline.mjs` + `validate:agent-log-timeline` npm script, asserting: no hook echoes by default, payload summarization bounds, run scoping, status-transition entries, approval-resolved bridging, turn-summary fields — using the same in-process harness style as existing validate-* scripts (e.g. validate-middleware-log.mjs).

### D11: `AgentLog` collapses to persistence-only (user decision)
Investigation confirmed the in-memory surface has zero external callers: query APIs (`getEntries`/`filter`/`recent`/`errors`/`issues`), `toConsole`, `toJSON`/`fromJSON`/`toString`, `clear()`, and the 10k ring are dead weight, and the `Emitter`+`on("entry")` indirection serves only the file sink. New shape: `log()` appends the JSON line directly into the sink's pending buffer; `AgentLog` keeps constructor options `enabled`/`minLevel`, `setEnabled`/`setMinLevel`, `getFileSinkDir()` (used by agent-manager for subagent sinks), and `attachFileSink()` (with its existing rotation/backfill semantics — note: sink "backfill" of pre-attach entries disappears naturally since there is no memory ring; attach-before-first-log ordering is already guaranteed by `local-agent-session-host.ts:123` attaching at session creation). Alternatives considered: keeping a small tail buffer for crash forensics (rejected: the JSONL file on disk already holds everything; the buffer would duplicate it); keeping the Emitter for future consumers (rejected: YAGNI — re-adding an emitter later is trivial).

### D12: UI debug chain removed wholesale (user decision)
The chain `managed.log.on("entry")` → session `log` channel (`local-agent-session.ts:279-284`) → SSE → app `use-agent-log` store + `bindSessionLog` → `Debug.tsx` exists solely to render the (now-deleted) debug stream. Remove: the channel forwarding block and its `channelAllowed("log", ...)` use, `packages/app/src/hooks/use-agent-log.ts`, `Debug.tsx` (and its mounting in the App tree), the `useAgentLog` member of `AdapterHooks` + all `clear()` call sites in `create-agent.ts`, the `hooks/index.ts` re-export, and the playground's `useAgentLog` injection (`App.tsx`). Server SSE forwarding needs no change (it forwards channels generically). Risk: remote-session clients relying on the `log` channel — none known; the CLI and extension hosts never consumed it.

## Risks / Trade-offs

- [Lost debugging detail: full tool payloads no longer in logs] → `outputPath` reference to the existing tool-output cache; `MY_AGENT_LOG_HOOKS` and a `MY_AGENT_LOG_FULL_PAYLOADS` opt-in restore old behavior when needed.
- [Weak models hallucinating from prompt text won't be fixed by logs] → out of scope; this change targets observability only.
- [Status-transition logging could be noisy during rapid chunk-driven transitions] → dedupe on identical `to` status; chunk-driven transitions already coalesce in the controller (waiting/awaiting_user stickiness).
- [Bridge summarizer may miss future large fields] → summarizer whitelists scalar fields by name pattern (`*Bytes`, `*Tokens`, `*Ms`, ids, names) and summarizes unknown object values by default, so new payloads degrade to preview rather than dump.
- [LogEntry schema drift] → additive optional fields only; zod schema (agent-log/schemas.ts) updated in the same commit; remaining consumers updated in the same change.
- [Deleting the UI log channel removes a live debugging aid] → user decision: the panel rendered the same low-value noise this change deletes; the JSONL file (openable with `jq`/`tail -f`) is the replacement, and richer structured fields land in this same change.

## Migration Plan

Single-package change, no data migration: old log files remain readable (missing new fields are optional). Rollback = revert commit. Sequencing: (1) summarizer + hook flag (noise removal, immediately visible), (2) metric enrichment + run scoping, (3) approval-resolved event + subagent stats, (4) bootstrap dedupe, (5) validation script.

## Open Questions

- None blocking. `firstTokenMs` semantics for non-streaming responses accepted as ≈ roundElapsedMs.
