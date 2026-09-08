# Tasks — Agent Log Event Timeline

## 1. Noise removal (bridge summarizer + hook flag)

- [x] 1.1 Add `summarizePayload` to `packages/core/src/managers/telemetry/event-log-bridge.ts`: whitelist scalar fields (`*Bytes`, `*Tokens`, `*Ms`, ids, names, counts), convert `tool_input`/`tool_output`/`input`/`prompt` objects to `{ <field>Bytes, <field>Preview }` with ≤200-char preview, drop `eventType`, and apply it in `writeLog`
- [x] 1.2 Gate `instrument-middleware-log.ts` entry writing behind lazy `MY_AGENT_LOG_HOOKS` env check (default off); keep async passthrough and naming unchanged
- [x] 1.3 Silence memory per-turn debug streams: in `event-log-rules.ts` drop `memory:prefetch`/`memory:extract`/`memory:consolidate` start/empty/selected/skip mappings (keep warn/error)
- [x] 1.4 Delete duplicate bootstrap direct calls in `agent-factory.ts` (skills :135, memory :166, doc notice :109, extension load success lines :203-333) and add one aggregated `session:bootstrap` summary entry via `session-bootstrap-events.ts` (counts only; keep failure warns)
- [x] 1.5 Update `packages/core/scripts/validate-middleware-log.mjs` expectations (hook entries only when flag set) and run it

## 2. Log entry schema: run scoping + size fields

- [x] 2.1 Add optional `run?: string` to `LogEntry` in `agent-log/types.ts` + zod schema in `agent-log/schemas.ts`; `AgentLog.log()` accepts and persists it
- [x] 2.2 Generate run short-id in `prepareManagedAgentForRun` (`managed-agent-run-lifecycle.ts`), store on ManagedAgent, include it in log calls from run lifecycle, tool bridge entries, status transitions, and `turn:summary`
- [x] 2.3 Add `inputBytes`/`outputBytes` to tool bridge data from `hookCtx.args` / `info.result` serialized sizes in `event-log-bridge.ts` rules for `agent:tool-start`/`agent:tool-end`

## 3. LLM timeline metrics

- [x] 3.1 Expose last-call cost + reasoning tokens from `UsageTracker` (`usage-tracker.ts`): track per-call `costUsd` in `accumulateTotal` and per-call `reasoningTokens` in `updateWindowUsage`; add getter(s)
- [x] 3.2 In `lifecycle-middleware.ts`: capture `firstTokenMs` (roundStart → first text/reasoning chunk in `onChunk`), thread `ctx.iteration` through, and enrich `llm:request` (`model`, `iteration`) and `llm:response` (`model`, `iteration`, `reasoningTokens`, `costUsd`, `roundElapsedMs`, `firstTokenMs`) via `event-log-rules.ts` mappings

## 4. Status transitions + approval resolution

- [x] 4.1 In `agent-status-controller.ts` `setStatus`: write one `agent` category entry `{from, to, trigger}` per actual transition (skip no-op sets)
- [x] 4.2 Add `agent:tool-approval-resolved` event type + payload (`tool_call_id`, `tool_name`, `decision`, `reason?`) in `runtime-types/agent-events.ts` + `agent-event-payloads.ts` (satisfy compile-time completeness check)
- [x] 4.3 Emit resolution event at user-decision path (`agent-chat-controller.ts` approval response handling) and command-safety auto-decision path; guard against resolving non-pending approvals
- [x] 4.4 Add Event→Log rule for `agent:tool-approval-resolved` → `approval` category entry in `event-log-rules.ts`

## 5. Subagent stats + turn summary

- [x] 5.1 Include `iterations`, `durationMs`, `usage` in the `subagent:completed` emit data in `run-subagent.ts`
- [x] 5.2 Upgrade `turn:summary` in `agent-chat-controller.ts`: LLM call count, tool call count, run token totals (input/output/cache), run cost USD, total duration, outcome (`finished`/`aborted`/`error`) — sourced from UsageTracker + pump outcome

## 6. Collapse AgentLog to persistence-only core (BREAKING)

- [x] 6.1 Rewrite `AgentLog` (`agent-log.ts`): remove `entries` ring, `maxEntries`/`trimEntries`, `getEntries`/`getCount`/`filter`/`recent`/`errors`/`issues`, `toConsole`, `toJSON`/`fromJSON`/`toString`, `clear()`, and the `Emitter`/`on("entry")`; `log()` writes the JSON line directly into the attached sink's pending buffer; keep `enabled`/`minLevel` options, `setEnabled`/`setMinLevel`, `getFileSinkDir()`, `attachFileSink()` (drop the now-meaningless pre-attach backfill)
- [x] 6.2 Update remaining `AgentLog` API consumers (subagent sink attach in `agent-manager.ts`, `adapter/hooks` types if any) and remove the unused module-level `getLog()` in `agent-log.ts`

## 7. Remove UI debug log channel chain (BREAKING)

- [x] 7.1 Delete the `log` channel forwarding block in `local-agent-session.ts:279-284` (and its `channelAllowed("log", ...)` reference)
- [x] 7.2 Delete `packages/app/src/hooks/use-agent-log.ts` (`useAgentLog`, `bindSessionLog`), its export in `hooks/index.ts`, and the `bindSessionLog` usage in `use-agent-chat.ts`
- [x] 7.3 Delete `packages/app/src/components/Debug.tsx` and its mount point in the App tree
- [x] 7.4 Remove `useAgentLog` from `AdapterHooks` type + all `clear()` call sites in `adapter/create-agent.ts`; update playground `App.tsx` hook injection and any other hosts passing `useAgentLog`

## 8. Validation & docs

- [x] 8.1 Create `packages/core/scripts/validate-agent-log-timeline.mjs` + `validate:agent-log-timeline` npm script asserting: no hook echoes by default, payload size/preview bounds, run scoping across a two-run session, status-transition entries, approval-resolved bridging, llm metric fields, turn-summary completeness, persistence-only surface (no query methods), and no `log` channel frames on session events
- [x] 8.2 Run `pnpm typecheck` (core + app + playground) + `pnpm build:core` + `pnpm build:app` + new validate script + existing `validate:middleware-log` and `validate:*` scripts touching touched modules (event-log, session-bootstrap); fix fallout
- [x] 8.3 Update `packages/core/ARCHITECTURE.md` observability/log section (persistence-only timeline contract, opt-in flags, boundary vs session journal, UI debug channel removed)
