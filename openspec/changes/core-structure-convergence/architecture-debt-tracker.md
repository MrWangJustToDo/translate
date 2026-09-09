# Core Architecture Debt Tracker

Tracking redundant, overlapping, and unclear responsibilities in `packages/core` after TanStack migration and `ManagedAgent` convergence.

**Related:** [design.md](./design.md) · [tasks.md](./tasks.md) · [proposal.md](./proposal.md)

**Last reviewed:** 2026-07-07

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Done |
| `[—]` | Won't fix / deferred with reason |

| Severity | Meaning |
|----------|---------|
| **P0** | Bug or blocks convergence |
| **P1** | High — boundary confusion, duplicate logic |
| **P2** | Medium — maintainability / testability |
| **P3** | Low — cleanup, deprecated aliases |

---

## Current Architecture Snapshot

```
AgentManager (registry + event bus)
  └── ManagedAgent (~514 lines) — composition root
        ├── services: SessionService / MemoryService / CompactionService /
        │   ExtensionRegistryService / UsageHistoryService (managers/services/)
        ├── run lifecycle: RunCoordinator (flags, abort, timing, run id)
        ├── context: AgentContext (messages + compaction only)
        ├── ui?: AgentUIChannel (subagent preview)
        └── run-agent → AgentRunner + middleware

agent/  — domain: tools, compaction, memory, session-store, hooks, subagent, runner, todo, usage
managers/ — runtime orchestration (agent/ imports managers types + injected deps)
```

**Done recently (B.10–B.11):** `AgentContext` slimmed; usage moved to `UsageTracker` / `agent.usage`. **2026-09:** run lifecycle → `RunCoordinator`; compaction → `CompactionService`; extensions → `ExtensionRegistryService`; usage persistence → `UsageStore` + `UsageHistoryService` (global `/usage` history).

---

## P0 — Bugs

| ID | Item | Location | Status | Notes |
|----|------|----------|--------|-------|
| P0-1 | `webfetch` uses removed `managedAgent.agent` | `agent/tools/webfetch-tool.ts:212,323` | `[x]` | Fixed: uses `managedAgent.addPendingAbortController` |

---

## P1 — High Priority

### Boundary: `agent/` ↔ `managers/`

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P1-1 | Bidirectional imports | See dependency table below | `[~]` | Headless paths inject `manager`; `local-connect` singleton retained |
| P1-2 | `loop/` shim misnamed | `agent/loop/` | `[x]` | **Deleted** — no remaining imports |
| P1-3 | Multiple `Agent` aliases | `loop/index.ts`, `managed-agent.ts`, `agent/index.ts` | `[x]` | Removed; app uses `ManagedAgent` (Phase C) |
| P1-4 | `emitAgentEvent` lives under `agent/loop/` but types from `managers/` | `managers/emit-agent-event.ts` | `[x]` | Moved to `managers/`; loop re-exports |

**`agent/` → `managers/` imports (representative):**

| File | Imports |
|------|---------|
| `middleware/lifecycle-middleware.ts` | `ManagedAgentState`, `UsageTracker` |
| `middleware/compaction-middleware.ts` | `AgentStatus`, `UsageTracker` |
| `subagent/run-subagent.ts` | `AgentUIChannel`, `emitAgentEvent`, injected `manager` |
| `tools/webfetch-tool.ts`, `websearch-tool.ts` | injected `ManagedAgent` |
| `connect/local-connect.ts` | `agentManager` (host singleton — intentional) |

---

### Compaction — three paths, two `shouldAutoCompact`

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P1-5 | Reactive compact duplicates `applyCompactionResult` | `managed-agent.ts` vs `apply-compaction-result.ts` | `[x]` | `applyReactiveCompactionResult()` shared helper |
| P1-6 | Two `shouldAutoCompact` implementations | `managed-agent.ts` vs `compaction/auto-compact.ts` | `[x]` | `shouldTriggerAutoCompact()` single source; deprecated alias removed |
| P1-7 | Dynamic turn context inside compaction middleware | `compaction-middleware.ts` | `[x]` | Extracted `turn-context-middleware.ts` |
| P1-8 | Retry constant duplicated | `managed-agent.ts` vs `reactive-compact.ts` | `[x]` | Uses `getMaxReactiveRetries()` |

---

### Events & Hooks — dual channel

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P1-9 | Dead event types never emitted | `agent-event-bus.ts` | `[x]` | Removed `tool:start`, `tool:post`, `tool:error`, `subagent:step`, `notification` |
| P1-10 | Tool hooks: middleware vs event-bus mapping | `hooks-middleware.ts` (active) vs event-bus mapping | `[x]` | Single path: hooks middleware only |

**Actually emitted today:**

| Event | Emitter |
|-------|---------|
| `session:start` | `manager-agent.ts` (create) |
| `prompt:submit` | `managed-agent.ts` (prepareForRun) |
| `agent:stop` | `run-agent.ts` (lifecycle onRunComplete) |
| `subagent:*` | `run-subagent.ts` |

---

### Subagent — config vs implementation gap

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P1-11 | `SubagentConfig` fields unused | `subagent/types.ts` | `[x]` | Removed `retryOnEmpty`/`maxRetried`; implemented `aggregateUsageToParent` |
| P1-12 | `SubagentResult` stub fields | `run-subagent.ts` | `[x]` | `run-stats.ts` derives iterations/limit/incomplete from UI + finishReason; removed `retries` |
| P1-13 | Subagent hard-depends on `agentManager` singleton | `run-subagent.ts` | `[x]` | `runSubagent(config, { manager })` injection |
| P1-14 | Same `runSubagent()` for exploration vs headless | task tool vs compaction vs memory extraction | `[ ]` | Deferred: split config modes later |

---

### Runtime God objects

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P1-15 | `ManagedAgent` too large | `managed-agent.ts` | `[x]` | Extracted `RunCoordinator` (`run-coordinator.ts`) |
| P1-16 | `AgentManager.createManagedAgent` factory blob | `agent-factory.ts` | `[x]` | Extracted `buildManagedAgent()` |
| P1-17 | Session restore in Manager, not Service | `session-service.ts` | `[x]` | `SessionService.restoreFromStore(sessionId)` |

---

## P2 — Medium Priority

### Usage & types

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P2-1 | `TokenUsage` in `agent-context/types`, tracker in `managers/` | `usage-tracker.ts` imports from agent-context | `[ ]` | Move to `managers/usage-types.ts` or `usage/` module |
| P2-2 | Side-query usage scattered | `session-service`, `memory-retrieval`, rename command | `[ ]` | Optional `UsageAccounting.recordSideQuery(source)` facade |

### Session & memory

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P2-3 | Save/restore asymmetry | save via `SessionService`; restore via `AgentManager` | `[ ]` | See P1-17 |
| P2-4 | High-frequency UI message persist | `run-agent.ts` stream bridge | `[ ]` | Debounce/batch `updateUIMessages` |
| P2-5 | Memory injection split | frozen: `managed-agent-prompt.ts`; dynamic: `compaction-middleware.ts` | `[ ]` | Document or unify injection pipeline |
| P2-6 | `ManagedAgent` memory pass-throughs | ~6 methods → `state.memory.*` | `[ ]` | Expose `agent.memory` directly to callers |

### Tools

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P2-7 | Tools use global `agentManager` | `webfetch`, `websearch`, subagent runner | `[x]` | Tools receive injected deps; headless compaction/memory inject `manager` |
| P2-8 | Subagent tool allowlist duplicated | `subagent/tools.ts` vs `SUBAGENT_EXCLUDED_TOOL_NAMES` | `[ ]` | Single manifest |

### Middleware & deps

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P2-9 | `lifecycle-middleware` does too much | status + usage + session save + memory extraction + emit | `[ ]` | Split middlewares |
| P2-10 | Three deps patterns overlap | `ServiceDeps`, `AgentRunDeps`, per-middleware getter bags | `[~]` | `buildManagedAgentDeps()` unifies service + run; middleware getters remain |
| P2-11 | `prepareForRun` vs middleware overlap | memory prefetch + prompt:submit in ManagedAgent; compaction in middleware | `[~]` | `RunCoordinator` now owns run-lifecycle flags/timing (7d0b195); `prepare()` pre-run consolidation still open |

### Exports

| ID | Item | Location | Status | Suggested direction |
|----|------|----------|--------|---------------------|
| P2-12 | Public API mixes domain + runtime | `src/index.ts` re-exports all | `[ ]` | Document sections or split entrypoints |
| P2-13 | Circular re-exports | `managers` → `agent/runner` | `[~]` | `agent/loop` removed; managers barrel internal-only |

---

## P3 — Low Priority

| ID | Item | Location | Status | Notes |
|----|------|----------|--------|-------|
| P3-1 | `sessionCacheHitTokens` never incremented | `managed-agent.ts` | `[x]` | Removed; `getCacheHitRatio()` derives from `usage.getTotal()` |
| P3-2 | `createTanStackTools` thin wrapper | `tanstack/create-tanstack-tools.ts` | `[ ]` | Only used in validate script; manager uses `createTools` |
| P3-3 | `UsageTracker.add()` deprecated alias | `usage-tracker.ts` | `[x]` | Removed |
| P3-4 | `SubagentResultLegacy` deprecated type | `subagent/types.ts` | `[x]` | Removed |
| P3-5 | `config` vs `agentConfig` duplicate on ManagedAgent | `managed-agent.ts` | `[ ]` | Consolidate to parsed config only |
| P3-6 | Stale design.md run-path diagram | `design.md` lines 5–17 | `[ ]` | Update to post-merge path (Phase D) |

---

## Suggested Work Order

Recommended sequence (each step should be a small PR):

1. **P0-1** — Fix `webfetch` `.agent` bug (5 min)
2. **P1-5, P1-6, P1-8** — Unify compaction paths
3. **P1-9, P1-10** — Event/hook channel cleanup
4. **P1-17, P2-3** — `SessionService.restore()`
5. **P1-15, P1-16** — Split ManagedAgent factory / coordinator
6. **P1-11–P1-14** — Subagent config honesty + injection
7. **P1-1, P2-7** — Remove `agentManager` singleton from tools/subagent
8. **P1-2, P1-3, P1-4, P2-12** — loop shim + exports (align with Phase C/D)

```mermaid
flowchart LR
  P0[P0 webfetch bug] --> C[Compaction unify]
  C --> E[Events/hooks cleanup]
  E --> S[Session restore]
  S --> M[ManagedAgent split]
  M --> SUB[Subagent deps]
  SUB --> DEP[Remove singletons]
  DEP --> EXP[Exports + loop rename]
```

---

## Module Health Summary

| Module | Responsibility | Health | Top issue |
|--------|----------------|--------|-----------|
| `managers/` | Runtime orchestration | 🟡 | God objects, factory blob |
| `agent/loop/` | *(removed)* | 🟢 | Deleted; runtime lives under `managers/` |
| `agent-context/` | Conversation state | 🟢 | Done (B.10–B.11) |
| `usage-tracker` | Token/cost tracking | 🟢 | Types still cross-layer (P2-1) |
| `compaction/` | Algorithms | 🟡 | Orchestration split 3 ways |
| `session/` + `session-service` | Persist + sync | 🟡 | Restore not in service |
| `memory/` + `memory-service` | Store + turn prefetch | 🟢 | Injection points scattered |
| `tools/` | Tool definitions | 🟡 | Singleton + webfetch bug |
| `subagent/` | Delegated runs | 🟡 | Manager injection done; result fields partially stubbed |
| `middleware/` | TanStack hooks | 🟡 | lifecycle bloated; deps overlap |
| `runner/` | Stateless chat wrapper | 🟢 | Clear |
| `models/` | LLM adapters | 🟢 | Clear |
| `connect/` | CLI bridge | 🟢 | Thin, appropriate |
| `hooks/` + `agent-event-bus` | Scripts + events | 🟡 | Dual hook path |
| `agent-log/` | Persistence-only event timeline + JSONL sink | 🟢 | Clear |
| `skills/`, `mcp/`, `todo/` | Feature modules | 🟢 | Clear |

---

## Validation After Each Phase

| Check | Command / action |
|-------|------------------|
| Build | `pnpm build:core` |
| Lint | `pnpm lint` |
| Status / compact scripts | `node packages/core/scripts/validate-agent-status.mjs` |
| Reactive compact | `node packages/core/scripts/validate-reactive-compact.mjs` |
| Emit events | `node packages/core/scripts/validate-emit-agent-event.mjs` |
| CLI smoke | message, tool call, `/compact`, `/clear`, resume, task subagent |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-07 | P1-1 headless manager injection; subagent UI → `ManagedAgent.ui`; remove `subagentPreviewStore` |
| 2026-07-07 | Phase C + E.7–E.9: ManagedAgent type migration, buildManagedAgentDeps, webfetch/websearch injection |
| 2026-07-07 | Phase E: compaction unify, event cleanup, session restore, AgentFactory, subagent deps, loop shim cleanup |
| 2026-07-07 | Initial tracker from post–agent-context-slim architecture review |
