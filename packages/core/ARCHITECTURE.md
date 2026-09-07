# @my-agent/core — Runtime Architecture

This document describes how `@my-agent/core` boots, initializes agents, and runs the main loops: session, tools (including approval), compaction, and memory.

For monorepo-wide context see [AGENTS.md](../../AGENTS.md). For public exports see [src/index.ts](./src/index.ts).

---

## Completion status (as of 2026-09)

| Area                                      | Status           | Notes                                                                                                                   |
| ----------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| CoreEnv abstraction                       | **Done**         | `registerCoreEnv` / `getEnv`                                                                                            |
| Agent factory & manager                   | **Done**         | Root vs subagent split                                                                                                  |
| TanStack agent loop                       | **Done**         | `AgentRunner` + middleware stack                                                                                        |
| Event protocol + Event→Log bridge         | **Done**         | `AgentTelemetryBus`, `event-log-bridge.ts`                                                                              |
| Model config (`openai` / `anthropic`)     | **Done**         | `resolveModelConfig`, `createTextAdapter`                                                                               |
| Session persistence                       | **Done**         | Unified `persistSession`; save failures reject + emit `session:save-error`                                              |
| Agent Session API                         | **Done**         | Snapshot/commands + Local/Remote Host; **app is Session-only** (no ManagedAgent in UI)                                  |
| Compaction (micro / auto / reactive)      | **Done**         | + manual compact via ManagedAgent / Session `compact`                                                                   |
| Memory (prefetch / extract / consolidate) | **Done**         | Post-run extraction; in-flight extracts coalesce to latest (`queued`)                                                   |
| Tool approval                             | **Done in core** | `status` middleware + `needsApproval` on tools; app handles UI/keyboard only                                            |
| Extensions                                | **Done**         | `ExtensionRunner` + `extensions-middleware` + per-turn `before_agent_start` / turn-context providers                    |
| Plan mode                                 | **Done**         | `PlanModeController` + tool filter + `/mode plan`; session `planMode` restore; executing auto-approve gated on `todosSeeded` |

**Known gaps**

1. **Tool approval UX** — core `AgentChatController` owns tool-phase continuation (package-internal); app handles UI/keyboard only.
2. **Subagents** — no session store, memory, MCP, or extensions (by design).
3. **`reasoningConfig`** — `defaultEffort` is wired as the runner's default when no explicit `reasoningEffort` is configured (`run-agent.ts`); `effortValues` remain advisory (adapter picks closest supported effort).

---

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Hosts: CLI / Extension                                           │
│   AgentSession (Local or Remote) ← preferred host API              │
│   registerCoreEnv(node|remote) — workspace plane (separate)      │
└────────────────────────────┬────────────────────────────────────┘
                             │ getSnapshot / dispatch / subscribe
┌────────────────────────────▼────────────────────────────────────┐
│ @my-agent/core                                                  │
│  AgentSession ← Domain Emitters + filtered AgentTelemetryBus         │
│  AgentManager ──► ManagedAgent (run semantics unchanged)         │
│  AgentTelemetryBus ──► Event→Log (lifecycle telemetry)               │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Workspace: node | server /api/fs|command…                        │
│ Agent HTTP: server /api/agent/* (Session REST + SSE)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Startup entry points

### 1.1 Host bootstrap (CLI example)

```
packages/cli/src/index.tsx
  loadEnv()
  parseCliArgs()
  registerCoreEnv(createNodeEnv(...) | createRemoteEnv(url))
  registerModelProvider(createDirectModelProvider(...) | createRemoteProvider(url))
  initConfig()
  render(<App />)
```

**Rule:** `registerCoreEnv()` must run before any `@my-agent/core` API that touches filesystem, shell, or platform. `registerModelProvider()` must run before agent creation / `resolveModelConfigFromProvider`.

### 1.2 App agent creation

```
packages/app/src/adapter/create-agent.ts
  resolveModelConfigFromProvider({ model, style, baseURL, apiKey })
    // merges ModelProvider (remote forces baseURL/apiKey)
  agentManager.createManagedAgent({ modelInfo, modelStyle, ... })
  wire React stores (useAgent, useAgentLog, useTodoManager)
  optional: continueLatestSession() / resumeSession() → initialMessages
```

### 1.3 Chat transport (in-process)

| API                                                                                | File                                | Use                                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `ManagedAgent.initChat(manager, initialMessages?)`                                 | `managers/agent-chat-controller.ts` | Main CLI chat session                               |
| `AgentChatController.sendMessage` / `steer` / `followUp` / `respondToToolApproval` | same                                | User turns, mid-run queues, tool-phase continuation |
| `agentManager.runAgentStream(agentId, input)`                                      | `managers/run-agent.ts`             | Core streaming entry                                |
| `AgentSession` / `AgentSessionHost`                                                | `agent-session/`                    | Preferred host/UI control surface                   |

### 1.4 Public vs internal APIs

| Symbol                                                            | Exported from `@my-agent/core`?                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `agentManager`, `AgentManager`                                    | Yes — bootstrap / CLI; **UI hosts must use AgentSession**                           |
| `ManagedAgent`, `ManagedAgentConfig`                              | Yes — bootstrap only; app forbids importing ManagedAgent                            |
| `AgentChatController`                                             | **No** — package-internal (`dev.ts` / validate); reached via ManagedAgent bootstrap |
| `ManagedAgent.initChat`                                           | Yes (bootstrap helper)                                                              |
| `AgentSession`, `AgentSessionHost`, `createLocalAgentSessionHost` | Yes — **preferred host/UI control surface**                                         |
| `buildManagedAgent`, `getDefaultSkillDirs`                        | **No** — package-internal / `dev.ts`                                                |
| Session-sync tracker helpers, tool-phase pump helpers             | **No** — `dev.ts` / package-private                                                 |
| `bridgeTelemetryToAgentLog`                                       | **No** — wired in `AgentManager` constructor                                        |
| `SessionStore`                                                    | **No** — DENY list; use Session / SessionService                                    |

See `scripts/validate-core-public-exports.mjs` for the authoritative DENY/EXPECT lists.

### 1.5 Module layering

```
hosts / app  →  managers (orchestration)  →  agent/* (domain)  →  models / env
                              ↓
                       runtime-types/   (shared status, events, TokenUsage — no manager deps)
```

**Rules (enforced by validate scripts):**

- `agent/**` MUST NOT import `managers/**`
- `models/**` MUST NOT import `managers/**`
- Shared cross-layer types live in `runtime-types/`
- Package-wide stream helpers live in `agent/stream/` (not under `subagent/`)
- UI channel lives in `agent/ui-channel.ts`
- Run middleware lives in `managers/middleware/` (wired by `run-agent`); plan-mode middleware stays in `agent/plan/`

### 1.6 ManagedAgent host surface

| Field / API                                 | Host access                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `status`, `context`, `ui`                   | Read-only getters                                                                  |
| `usage`, `planMode`, `autoMode`             | `readonly` service refs (mutate via methods); auto and plan are mutually exclusive |
| `runner`, `textAdapter`, `runnerConfigKey`  | **Private** — package-internal accessors only                                      |
| `setStatus` / `setContext` / `setUIChannel` | Mutation entry points (`setUIChannel` package-internal)                            |
| `statusController.applyRunOutcome(...)`     | Unified run finalization (chat + detached/subagent)                                |

---

## 2. Initialization process

### 2.1 `AgentManager.createManagedAgent(config, parentId?)`

```
agent-manager.ts
  buildManagedAgent({ config, manager, emit, getDefaultSkillDirs })
  agents.set(managed.id, managed)
  emitSessionBootstrapEvents(managed, bootstrap)   // root agents only
  link parent.childIds if subagent
```

### 2.2 `buildManagedAgent` wiring (`agent-factory.ts`)

**Root agent** (`!parentId`):

| Step | Action                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `AgentLog`, `TodoManager`, `ManagedAgent` (UI channel attached before LLM runs)                                                                                                                                                                                                             |
| 2    | `createTools()` → filesystem, grep, glob, tree, run_command, …                                                                                                                                                                                                                              |
| 3    | `managed.dispatchEvent = emit` (routes to `AgentTelemetryBus`)                                                                                                                                                                                                                              |
| 4    | `loadAgentDoc()` → `setAgentDocContent` (AGENTS.md / CLAUDE.md)                                                                                                                                                                                                                             |
| 5    | `todo`, `webfetch`, `websearch`, `ask_user` tools                                                                                                                                                                                                                                           |
| 6    | `SkillRegistry.loadFromDirectories` → `list_skills`, `load_skill`, `task`                                                                                                                                                                                                                   |
| 7    | `setCompactionConfig` from model context window                                                                                                                                                                                                                                             |
| 8    | Create `McpManager` + `MemoryManager` data layers (connected / registered later by the built-in extensions below)                                                                                                                                                                           |
| 9    | `ExtensionLoader` / `ExtensionRunner` — scan `.agents/extension` then `~/.agents/extension` (plus `AGENT_EXTENSION_DIRS` / `config.extensionDirs` / `--extension-dirs`); programmatic `config.extensions` last                                                                              |
| 10   | Built-in extensions through the runner — LSP (`my-agent-lsp`), Skills (`my-agent-skills`), Memory (`my-agent-memory`), MCP (`my-agent-mcp`: `McpManager.initialize` on activate, tools kept as `mcp__<server>_<tool>` with multimodal `content[]`, `/mcp` command; deactivate → `shutdown`) |
| 11   | `SessionStore` → `setSessionStore({ modelStyle, model })`                                                                                                                                                                                                                                   |

**Subagent** (`parentId` set): inherits parent config via `spawnSubagent`; skips docs, skills, MCP, memory, extensions, session, and most root-only tools.

### 2.3 Event infrastructure (manager construct time)

```
AgentManager constructor
  new AgentTelemetryBus()
  bridgeTelemetryToAgentLog(bus, resolveLog)   // centralized lifecycle logging
```

Observation is split into four layers (do not mix interception into the lifecycle bus):

| Layer            | Mechanism                                                                                                     | Role                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| L1 Control plane | `AgentStatusController` + L1 Emitter → Session `state`                                                        | status / error / pendingApproval                |
| L2 Lifecycle bus | `AgentTelemetryBus` → Event→Log (+ Session `lifecycle` / `agentManager.on`)                                   | fire-and-forget notify                          |
| L3 Data plane    | `AgentUIChannel` + tool-output registry → Session `messages` / `tool`; `SummaryStreamHub` → Session `summary` | UIMessages / tool stdout / task·compact summary |
| L4 Interception  | `ExtensionEventBus` only                                                                                      | skip / transform tool args                      |

### 2.4 Session bootstrap events (`session-bootstrap-events.ts`)

Emitted **after** the agent is registered (so Event→Log bridge can resolve `managed.log`):

| Event            | When                       |
| ---------------- | -------------------------- |
| `session:doc`    | Agent doc loaded           |
| `session:skill`  | Skills registered          |
| `session:mcp`    | MCP servers connected      |
| `session:memory` | Memory index ready         |
| `session:start`  | Bootstrap complete (`cwd`) |

These also map to hook scripts where applicable (`SessionStart`, `Notification`, etc.) via `agent-event-bus.ts`.

**Note:** `session:start` does not create a `SessionData` file yet. The first on-disk session record is created lazily on first save.

---

## 3. Session start flow (user prompt → first LLM call)

### 3.1 Shared run skeleton + profiles

Inner LLM/tool stream execution is shared. Outer orchestration differs by **profile**:

```
Shared skeleton (agent/run/run-agent-skeleton.ts)
  ensureUIChannel → manager.runAgentStream → consumeAgentStream(channel)
  → optional applyRunOutcome(path: chat|detached)

InteractiveChat profile (AgentChatController)
  pumpToolPhases / queues / approvals / session persist
  → runAgentOnce(channel) per stream; outcome path "chat" after full pump

Worker profile (runSubagent — task / compact / memory)
  spawn + tool isolation → always ensureUIChannel → runAgentOnce once
  → bridgeUI only gates parent panel / task-tool streaming
  → outcome path "detached" (avoids task-panel ghosts)
```

Host observation remains **AgentSession** only. Multiple live root sessions are supported: each root is a separate `ManagedAgent` instance (registered in the app store's live-session registry, switched via `Ctrl+X`), and they reuse this same run skeleton per instance. `AgentManager`'s ownership registry (`Map<sessionId, agentId>`) keeps each disk session bound to one live agent (§6.3).

### 3.2 `runAgentStream` pipeline

```
run-agent.ts: executeManagedAgentRun
  ensureAgentRunner(managed)          // build middleware + AgentRunner
  managed.prepareForRun({ messages, abortSignal })
  // Reuse RunCoordinator.currentAbortController as TanStack chat abortController
  // so ManagedAgent.abort() cancels the live stream (main agent + subagent/task).
  runStreamWithRecovery({ run: () => runner.run({ abortController }) })
```

### 3.3 `prepareForRun` (`managed-agent.ts`)

```
RunCoordinator.setupAbortController(abortSignal)  // current = run AbortController
if !isToolContinuationPrepare(agent.status, messages):
  memory.prefetchRelevantMemories()     // see §7
  emitEvent("prompt:submit", { prompt })
```

`AgentChatController.executeStream` must **not** create a second AbortController before `runAgentStream` — that previously left `abort()` cancelling a controller `chat()` was not listening to. Status middleware keeps `"aborted"` sticky so leftover chunks cannot resurrect `"running"`.

On user cancel, `cancelIncompleteToolCalls` marks truncated / never-executed tool calls (`input-streaming`, orphan `input-complete`, etc.) as `error` with a synthetic tool-result. That stops the UI spinner and prevents the next `chat()` from re-entering TanStack `executeToolCalls` with invalid JSON arguments.

`isToolContinuationPrepare` uses existing state — no extra run-phase field:

- `status === "waiting"` (approval pause), or
- last message is not `user` (tool-phase / approval continuation within the same turn).

### 3.4 Middleware stack (each LLM iteration)

Built in `buildAgentRunner` (`run-agent.ts`), order matters.
Sources: `managers/middleware/*` for run stack; `agent/plan/plan-mode-middleware.ts` for plan gating.

```
1. status-middleware         status transitions only (via AgentStatusController)
2. lifecycle-middleware      usage tracking, thinking events, memory commit, llm:request/response
3. compaction-middleware     auto-compact only (DeepSeek reasoning echo is adapter-only)
4. tool-compact-middleware  per-tool LLM shaping
5. turn-context-middleware  inject changed <ctx kind=...> sections post-compaction (per-kind
                             hash diff; subagents filtered by SUBAGENT_ALLOWED_KINDS whitelist;
                             systemPrompts = frozen only)
6. extensions-middleware    ExtensionEventBus intercept + agent:tool-* lifecycle events
7. early-tool-result-ui     apply each tool output to StreamProcessor as soon as it finishes
8. task-prefork-middleware  subagent task prefork / phase state
9. plan-mode-middleware     block forbidden tools while plan mode restricts tooling
10. background-notification-middleware
                             completed background-command notifications as <ctx kind=background_notification>
                             synthetic messages (append; persisted + id-deduped)
11. prompt-cache-middleware  Anthropic cache_control + OpenAI prompt_cache_key + sorted tools
                             (must stay last so cache breakpoints see the final payload)
```

TanStack runs tools sequentially but emits batched `TOOL_CALL_END` results only after the whole tool phase. `early-tool-result-ui` calls `AgentUIChannel.addToolResult` in `onAfterToolCall` so finished tools (e.g. the first of two `task` calls) show complete while later tools still run. The later stream chunks re-apply the same output idempotently.

**Approval continuation:** After the user (or auto-approve) responds, a second `chat()` run executes pending tools and TanStack may re-emit `TOOL_CALL_START`/`ARGS` with an `argsMap`. `AgentUIChannel` drops those replays when the `toolCallId` already exists in UI messages so the call is not cloned onto a new assistant (approval metadata stays on the original part). `TOOL_CALL_END`/`RESULT` still flow to update that part.
Status logic is centralized in `AgentStatusController` (`managers/agent-status-controller.ts`). `status-middleware` is the runtime hook for status; `lifecycle-middleware` owns usage and run finalization side-effects. Chat and detached runs converge on `statusController.applyRunOutcome(...)` (see `managers/agent-run-outcome.ts`).

### 3.5 Lifecycle status transitions

| Phase                       | Status                  | Trigger                                                      |
| --------------------------- | ----------------------- | ------------------------------------------------------------ |
| Run starts                  | `running`               | `status.onRunStart` / `prepareRunPhase`                      |
| Model reasoning             | `thinking`              | `REASONING_MESSAGE_*` chunk                                  |
| Text output                 | `responding`            | `TEXT_MESSAGE_CONTENT`                                       |
| Tool call                   | `running`               | `TOOL_CALL_START`                                            |
| Tool approval pending       | `waiting`               | `status.syncApprovals` on `onToolPhaseComplete`              |
| Client tool (`ask_user`)    | `awaiting_user`         | App host calls `ManagedAgent.setClientToolWaiting(true)`     |
| Auto-compact                | `compacting`            | `status.beginCompaction("auto")`                             |
| Reactive compact            | `compacting`            | `status.beginCompaction("reactive")`                         |
| Success                     | `completed` / `idle`    | `onRunFinish` (preserves `waiting` / `awaiting_user` if set) |
| Stream ended, tools waiting | `completed` / `waiting` | `statusController.reconcileAfterRun` after `pumpToolPhases`  |
| User abort                  | `aborted`               | `onRunAbort` / `onUserCancel` / `RunCoordinator`             |
| Error                       | `error`                 | `onRunError` / `onExternalError`                             |

---

## 4. Tool approval flow

Core **declares** which tools need approval and **owns agent status** during the approval pause. **Execution blocking** and resume are still handled by TanStack AI + `@my-agent/app` (`addToolApprovalResponse`).

### 4.1 Core: `needsApproval: true` + status middleware

`createStatusMiddleware` (`managers/middleware/status-middleware.ts`) delegates approval transitions to `AgentStatusController`:

| Hook                  | Action                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `onToolPhaseComplete` | When `info.needsApproval.length > 0`: `waiting`, `setPendingApprovalCount`, emit `agent:tool-approval-request` per tool |
| `onBeforeToolCall`    | When status is `waiting`: clear count, `running` (approved tool executing)                                              |

Tools with approval required (`defineServerTool` in `runtime/define-tool.ts`):

- `write_file`, `edit_file`, `delete_file`
- `run_command`

Helper (available but not used by app today):

```typescript
managed.isToolNeedsApproval(toolName); // managed-agent.ts
```

### 4.2 TanStack protocol

`AgentRunner.run()` → TanStack `chat({ tools, middleware })` emits stream chunks. When a tool has `needsApproval: true`, the stream includes approval request state on tool parts (`part.approval`).

### 4.3 App layer (not in core)

| Step                         | Location                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chat session                 | **core** `AgentChatController` — `StreamProcessor` + `pumpToolPhases()`                                                                                                                                                              |
| App hook                     | `use-agent-chat.ts` — `AgentSession` dispatch + subscribe (`messages` / `queues` / `state`)                                                                                                                                          |
| Detect pending approval (UI) | `use-agent-chat.ts` — `isPendingToolApproval()` for keyboard / input mode                                                                                                                                                            |
| Agent status                 | **core** `approval` middleware — not app                                                                                                                                                                                             |
| UI                           | `ToolCallPartView.tsx`, `Footer.tsx`                                                                                                                                                                                                 |
| Keyboard                     | `use-agent-keybindings.ts` — `y` approves **one** pending tool per press; `n` enters freeform deny-reason input                                                                                                                      |
| Deny reason                  | App collects reason in freeform mode; `respondToToolApproval(id, false, reason)` stores it on `part.approval.reason` and adds a `tool-result` part for the LLM                                                                       |
| Empty model turn             | TanStack may leave a `parts: []` assistant shell after `TEXT_MESSAGE_START` with no content; `AgentUIChannel.finalizeStream()` strips trailing shells; `needsAgentResponseAfterTools()` skips shells when deciding pump continuation |
| Resume                       | `respondToToolApproval()` — core re-runs while `shouldContinueAgentPump()` (approved execution or model follow-up after denial)                                                                                                      |

**Mixed tool batches** (e.g. `tree` + `run_command`): TanStack defers non-approval tools while approvals are pending. Core `pumpToolPhases()` loops `runAgentStream()` until `shouldContinueAgentPump()` is false — no `ChatClient.shouldAutoSend()`.

**Steering / follow-up queues:** While a pump is executing (`pumpDepth > 0`) or status is `waiting` / `awaiting_user`, `steer()` / `followUp()` enqueue user content without aborting. A finished pump that left status `running` because tool-phase work remains (`shouldContinueAgentPump`) does **not** defer — `sendMessage` starts a fresh pump (and the controller auto-chains another pump when the phase cap is hit). Drain points in `pumpToolPhases`:

| API        | When delivered                                                                |
| ---------- | ----------------------------------------------------------------------------- |
| `steer`    | After tool execution finishes for the current batch, before the next LLM call |
| `followUp` | Only when the agent would otherwise stop (no tool continuation)               |

Default drain mode is `one-at-a-time`. `stop()` / `clearMessages()` clear both queues. Mid-run injects call `markNextPrepareAsContinuation()` so prepare skips memory prefetch / `prompt:submit`.

### 4.4 Client tools (`ask_user`)

Client tools pause the run until the host supplies output via `addToolResult`. Core does **not** infer UI status from message parts — the app sets it explicitly:

| API                                        | When                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `ManagedAgent.setClientToolWaiting(true)`  | App detects pending `ask_user` (select list or freeform) |
| `ManagedAgent.setClientToolWaiting(false)` | User submits answer, before `addToolResult`              |

Status becomes `awaiting_user` (distinct from approval `waiting`). Exposed in CLI via `useAgentChat().setClientToolWaiting`.

**Critical:** `runner.run()` receives **UIMessages** from `AgentChatController` so TanStack `chat()` can extract `part.approval` before conversion.

No manual user text is required; each `y` only approves one tool when several `run_command` calls are pending.

### 4.4 Extensions vs user approval (different mechanisms)

| Mechanism                    | File                                                               | Purpose                                     |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| **User approval**            | TanStack + app                                                     | Block destructive tools until user confirms |
| **Extension deny/transform** | `extensions-middleware.ts` → `ExtensionEventBus` (`tool:before:*`) | Extension skip/transform before tool runs   |

Lifecycle tool events (`agent:tool-start` / `agent:tool-end` / `agent:tool-error`) always emit on AgentTelemetryBus (L2), whether or not an extension runner is present. Extension bus traffic is L4 only.

---

## 5. Compaction flow

Three proactive layers run on **every** LLM iteration (via `compaction-middleware.onConfig`), plus reactive retry on API errors.

### 5.1 Layer 1 — Tool compact

**Files:** `agent/compaction/tool-compact/`, `managers/middleware/tool-compact-middleware.ts`

Runs **after** context auto-compact in the middleware stack.

- Tools with `toModelOutput` on `defineServerTool` are transformed for the LLM; result cached per `toolCallId` in `ToolCompactCache`
- **Skips** approval placeholders (`pendingExecution: true`) — tool-compact runs on `onConfig` before execution; transforming those messages would strip the marker and TanStack would skip the real tool run
- **Preserves tool errors** (`{ error: string }` from TanStack `output-error`) — bypasses success-only `toModelOutput` formatters and keeps an explicit `Error: …` text result
- **UI** `UIMessage` history is unchanged; only the LLM `ModelMessage` path is shaped

Large tool outputs at **execute** time still use `maybeCacheOutput` (`.agents/cache/tool-output/`) as a separate fallback — not part of compaction.

### 5.2 Adapter vs capability boundary

**Rule:** provider wire-protocol quirks belong under `packages/core/src/models/` (`createTextAdapter` and subclasses). Middleware / tools / UI must not branch on vendor names (`deepseek`, etc.).

| Kind                   | Where                                       | Examples                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adapter-specific**   | `models/adapter-factory.ts`, `*-adapter.ts` | DeepSeek `reasoning_content` echo (`ReasoningChatCompletionsTextAdapter`); Chat Completions tool-image lift (`liftToolMediaForChatCompletions` — tool text stays string, images become a synthetic user `image_url` message); PDF text extract in `read_file` for Completions; Anthropic vs OpenAI Chat Completions style selection |
| **Capability-generic** | middleware / reactive retry                 | Multimodal strip via `vision`/`audio`/`video`/`document` (`capability-message-utils`); `prompt_too_long` reactive compact                                                                                                                                                                                                           |
| **Config / metadata**  | `model-config`, `models.dev`, session       | `modelStyle`, pricing, `capabilities[]`, unused-for-now `reasoningConfig` (tag/effort/budget — not yet mapped to request options)                                                                                                                                                                                                   |

**DeepSeek reasoning echo** (`reasoning-chat-completions-adapter.ts` + `reasoning-content-cache.ts`):

1. Buffer stream `REASONING_MESSAGE_CONTENT` and emit `STEP_FINISHED.delta` so TanStack’s in-run engine keeps `message.thinking` on tool-call assistants.
2. Cache by `toolCallId`; `convertMessage` restores `reasoning_content` when UI→model conversion dropped `thinking`.
3. No chat / compaction / UI pipeline hooks for this.

### 5.3 Layer 3 — Auto compact

**Files:** `agent/compaction/auto-compact.ts`, `apply-compaction-result.ts`

**Trigger:** `shouldTriggerAutoCompact` when window input tokens ≥ `tokenThreshold × compactAtPercent / 100`. After a successful compact, `usage.resetWindow()` zeroes window tokens, so the next `onConfig` would otherwise fall through to `estimateTokens(projected wire)` and fire again immediately. Compaction middleware skips auto-compact when the latest durable channel message is already a SUMMARY (`isLatestDurableMessageCompactionSummary`, ignoring trailing `<ctx kind=...>`). `autoCompact` also no-ops when `toSummarize` is only previous SUMMARY / synthetic ctx messages.

```
setStatus("compacting") via beginCompaction("auto")
emit compaction:auto-start
autoCompact(messages, config, agentId, manager)
  → findCutPoint (keep recent user turns)
  → summarizeConversation with <to_compress> + <still_in_context> (+ optional <previous-summary>)
  → writeCompactArchive (.agents/transcripts/<sessionId>/compact-<n>.md) — non-fatal; merged ## Compact archives list appended (newest-first search guidance); prior archive sections stripped from <previous-summary> input
applyCompactionResult(channel, usage, result)
  → append `[CONVERSATION SUMMARY]` UIMessage onto the UI channel, reset window usage
  → return chronological post-append messages (for orphan tool-cache cleanup)
compaction middleware (same onConfig):
  → convertMessages(channel) → getModelVisibleMessages → { messages: wire }
emit compaction:auto-complete | compaction:auto-error
setStatus("running") via endCompaction
```

**Why re-project from the channel:** After append, TanStack `engineMessages` still match the **pre-compact** length. Returning those would drop the new SUMMARY for the immediate LLM call. Post-compact always rebuilds wire from the live channel. Engine `this.messages` is ephemeral and is never merged back.

`getModelVisibleMessages(chronological)` returns summary-first wire order:

```
[latestSummary, …kept turns before summary…, …messages after summary…]
```

The durable channel stays chronological. Projection is never written back.
The summarizer sees both the cut-away history and the kept tail (budget-aware) so Goal/Next stay aligned.
On later iterations (no compact), `onConfig` again converts the live channel and projects summary-first wire.

### 5.4 Reactive compact (emergency)

**Files:** `run-stream-recovery.ts`, `stream-recovery/*`, `reactive-compact.ts`, `managed-agent.handleReactiveCompact`

When the API returns `prompt_too_long`:

```
runStreamWithRecovery catches RUN_ERROR / thrown error
  → strategies: reactive-compact | capability-sanitize | transient-retry | max-tokens-continue
  → getMessages: () => managed.ui.getMessages()   // live channel, not a pre-run snapshot
  → reactive path: handleReactiveCompact (max 1 retry by default; skipped for subagents)
  → transient path: 429 / rate-limit / 502–504 / network — same messages + exponential backoff
    (honors Retry-After when present; works for main agent and subagents)
  → before restart-style retry (not max-tokens continue): subagents call
    `AgentUIChannel.resetForStreamRetry()` (keep user prompt, clear tools/summary phase)
    + `statusController.onRecoveryRetry()` so the task panel does not linger on `error`
  → beginCompaction("reactive")  // emits compaction:reactive-start only (not auto-start)
  → reactiveCompact: summarize + keep tail messages
  → applyReactiveCompactionResult → append SUMMARY on channel
  → endCompaction + emit compaction:reactive-complete | compaction:reactive-error
  → retry runner.run; next onConfig projects from live channel (shared MAX_RECOVERY_ATTEMPTS ≈ 3)
```

Unhandled `RUN_ERROR` chunks (anything other than a successful recovery strategy) are **thrown** — never yielded. `AgentChatController` / `AgentUIChannel.consumeRun` also wrap streams with `throwOnRunError`, so failures surface as `status: error` + `agent:stream-error` instead of a silent `Completed` with no assistant message. Handled errors are recorded on the agent and **not** rethrown from the chat pump (avoids unhandled rejection crashing the CLI).

**Empty stream guard:** Some OpenAI-compatible gateways return HTTP 200 HTML (e.g. SSO login) for `stream: true`; the SDK iterates zero chunks and does not throw. After each `chat()` consume, `AgentChatController` flags an error when messages show no model progress (no new/updated assistant text, tool calls, or tool results) via `shouldFlagEmptyModelStream` (`agent/run-helpers/empty-model-stream.ts`).

**Vision / multimodal:** Some text-only APIs (notably DeepSeek Chat Completions) reject multimodal parts with `unknown variant image_url, expected text`. `runStreamWithRecovery` uses capability-aware sanitization (`vision` / `audio` / `video` / `document`): unsupported parts are stripped from the **wire** copy (and all multimodal parts are stripped once on schema rejection); UI history keeps media for display.

### 5.5 Manual `/compact`

**File:** `packages/app/src/commands/compact.ts`

Calls exported `autoCompact` + `applyCompactionResult` directly (same engine as auto-compact).

### 5.6 Configuration

```typescript
compaction: {
  tokenThreshold: 100_000,      // default from model contextWindow (capped)
  compactAtPercent: 80,         // trigger at 80% of threshold
  keepRecentFlows: 2,           // recent user turns kept after auto-compact
}
```

Set via `ManagedAgentConfig.compaction` in `agent-factory.ts`.

---

## 6. Session flow

### 6.1 Storage

| Item      | Value                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| Directory | `.agents/sessions/`                                                                                              |
| File      | `{sessionId}.session.json`                                                                                       |
| Schema    | `SessionData` v4 (`agent/persistence/types.ts`; older files omit `planMode` / `approvals` / inline base64 media) |

Fields: `uiMessages` (includes in-chain summaries), `usage`, `cost`, `contextTokens`, `todos`, `todoPlanBound`, `planMode` (phase/markdown/path/seeded), `autoMode`, `approvals` (pending/approved/denied interrupt table), `modelStyle`, `model`, metadata.

**Binary media (v4):** On persist with `uiMessages`, `SessionService` clones → dehydrates Image/Audio/Video/Document parts to content-addressed **binary** files under `.agents/media/<hash>.<ext>`, writing `media://` refs + `metadata.mediaRef` into the session JSON. Runtime messages stay hydrated (data URLs / raw base64). Restore hydrates for the UI, then re-dehydrates into `this.data` and rewrites the session file (so interrupt-snapshot repairs and media extraction stick). See `agent/media/`.

**Interrupt snapshots:** TanStack `MESSAGES_SNAPSHOT` (tool-approval interrupts) is built from engine `this.messages` and would replace the chronological channel. `AgentUIChannel.processChunk` drops every snapshot. Incremental TEXT/TOOL chunks plus `addToolResult` / `addToolApprovalResponse` keep the channel current. Hydrate/dehydrate still repair stringified multimodal `ContentPart[]` in persisted JSON.

### 6.2 Write paths (unified persist)

| Trigger                                    | Function                                                                                   | What is saved                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Run finalizes** (finish / abort / error) | `ManagedAgent.finalizeRun` → `SessionService.persistSession`                               | Model fields: `usage`, `cost`, `contextTokens`, `todos`, `planMode`; auto-title if `"New Session"` |
| **User message (core)**                    | `AgentChatController` after `addUserMessage` (send / drained steer                         | follow-up) → `maybeSaveSessionUIMessages(..., "user-message")`                                     | Model fields **plus** `uiMessages` when fingerprint changed |
| **Pump idle (core)**                       | `AgentChatController.persistMessages` → `maybeSaveSessionUIMessages(..., "pump-complete")` | Same; also on Esc/abort after cancelling incomplete tools                                          |
| **Manual flush**                           | `saveSessionUIMessages` (`/clear`, slash commands)                                         | Force full persist                                                                                 |

App hosts subscribe to Session `messages`/`state` for UI only — they do **not** checkpoint to disk. Approval decisions are upserted into `SessionData.approvals` (`pending` on request, `approved`/`denied` on `y`/`n` or auto-approve) and written with the same persist triggers as `uiMessages`. Chat middleware rebuilds `resumeToolState.approvals` from that table (pending omitted). Format remains full JSON; `SessionSyncTracker` only skips duplicate fingerprints.

On restore, `PlanModeController.restoreState` rehydrates phase (and reloads markdown from `planFilePath` when missing). `/clear` / `ManagedAgent.reset` always `planMode.disable()`.

`SessionStore.save`: content-hash dedup, per-session write lock, full JSON overwrite.

**Run finalization** (`finalizeRun`):

| Reason     | Session persist | Memory extraction | `agent:stop`             |
| ---------- | --------------- | ----------------- | ------------------------ |
| `finished` | Yes             | Yes (async)       | `{ reason: "finished" }` |
| `aborted`  | Yes             | No                | `{ reason: "aborted" }`  |
| `error`    | Yes             | No                | `{ reason: "error" }`    |

Owned by the **chat pump** / detached runners — not per-`chat()` lifecycle middleware:

- `AgentChatController.pumpToolPhases` — after `applyRunOutcome` when kind is `finished` / `aborted` / `error` (not `waiting`, so approval resume keeps turn context)
- `AgentChatController.stop` — `aborted` (generation bump skips the in-flight pump’s outcome path)
- `run-subagent` — after detached `applyRunOutcome`

Idempotent per turn via `resetTurnLifecycle` / `beginTurnFinalize` (stop + pump must not double-fire).

### 6.3 Resume

```
AgentManager.resumeSession(agentId, sessionId)
  → managed.restoreSession(sessionId)
    → SessionService.restoreFromStore
      → usage.reset(); hydrate uiMessages
      → restore usage, todos, approvals (missing/`[]` backfills from UIMessage approval parts)
    → host.approvals.restore(session.approvals)
    → UI channel.setMessages(uiMessages) when channel present
    → clear steer/follow-up queues (no-op before initChat)
    → syncInteractionStateFromUIMessages (approval / ask_user)

Host.create `{ resumeSessionId | continueSession }` and Session `session.resume`
share that restore path. Create then calls `initChat(initialMessages)` because
the chat controller does not exist yet.

AgentManager.continueLatestSession(agentId)
  → store.getLatest() → resumeSession
```

App bootstrap resume still passes `initialMessages` from Host.create into `ManagedAgent.initChat()`.

**Ownership dedup.** `AgentManager` keeps a process-local ownership registry
(`Map<sessionId, agentId>`) so a disk session is bound to at most **one** live agent
at a time. `resumeSession` (and `restoreManagedSession`) first `assertFree(sessionId)` —
if that session is already owned by another live agent, restore is **rejected** with a
clear error (the `/resume` picker marks such entries `bound (active)`).
`startNewDiskSession` acquires ownership for the new session id, and `destroyAgent`
releases it, so an owned session is never double-resumed and never leaks after teardown.

### 6.4 Channel ↔ wire projection

**Message flow (expected contract):**

```
uiMessages (source of truth on AgentUIChannel; chronological, including SUMMARY checkpoints)
  → onConfig (every iteration, including post-compact):
      convertMessages(channel) → getModelVisibleMessages → { messages: wire }
      + resumeToolState.approvals from SessionData.approvals (pending omitted)
  → never write projected wire arrays back as durable channel state
  → drop every engine MESSAGES_SNAPSHOT; TEXT/TOOL + addToolResult keep the channel live
```

Recovery / continuation always re-reads `managed.ui.getMessages()` (not a closed-over snapshot from run start), so a mid-run compact is visible to the next attempt.

- **Each `onConfig`** (turn-context middleware, after compaction): changed `<ctx kind=...>` sections are injected into the channel + wire (per-kind hash diff); wire is otherwise projected from the live channel.
- **User send** (`AgentChatController.sendMessage` / drained queues): `maybeSaveSessionUIMessages(messages, "user-message")`.
- **After run idle** (`AgentChatController` after `pumpToolPhases`, including approval wait / abort cleanup): `maybeSaveSessionUIMessages(messages, "pump-complete")`.
- **During runs / core**: `persistSession()` and `finalizeRun` write model fields only; they never pass `uiMessages`.
- **Manual `/compact`**: appends summary checkpoint onto the channel; `persistSession()` + `maybeSaveSessionUIMessages(..., "force")`.
- **Manual `/clear`**: `saveSessionUIMessages()` force-flushes before rotating session.

### 6.5 Session events

| Event                | When                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| `session:restore`    | `ManagedAgent.restoreSession` succeeds (`messageCount`, `tokenEstimate`)             |
| `session:save-error` | `SessionStore.save` fails (target: `session`, `uiMessages`, or `session+uiMessages`) |

---

## 7. Memory flow

### 7.1 Index build + per-turn injection (not frozen)

```
MemoryManager.initialize()     // .agents/memory/*.md + MEMORY.md
createMemoryExtension → ctx.registerContextProvider({ content: () => <memory_index> })
collectBeforeAgentStart (per user turn) → <ctx kind=my-agent-memory> section
```

The memory index (`<memory_index>`) is **not** frozen into the system prompt — it is
injected per-turn by the built-in Memory extension via `registerContextProvider`, so
freshly extracted memories surface without waiting for compaction. The index is captured
at snapshot time by re-evaluating the provider each user turn and hash-diffed like any
other `<ctx kind=...>` section (only changed index re-injects).

### 7.2 Per-turn prefetch (before each run)

**`MemoryService.prefetchRelevantMemories`** — called from `prepareForRun`:

```
Extract last user message text
findRelevantMemories(query, manager, textAdapter, alreadySurfaced)
  → LLM side-query or keyword fallback, max ~5 memories
formatRelevantMemories → memory.relevantContent
emit memory:prefetch { status: injected | empty | skip-* | error }
```

### 7.3 Per-iteration injection

**`turn-context-middleware`** (runs `onConfig`, after compaction):

```
onConfig → build dynamic sections (current_date, git_status, memory, plan mode, etc.)
         → per-kind hash diff vs last admitted (seeded from persisted messages on restore)
         → changed kinds injected as synthetic <ctx kind=...> user messages
           (after latest real user; persisted; UI-filtered; wire + channel in sync)
systemPrompts = frozen only (no dynamic tail)
```

Dynamic context lives in chronological user messages so OpenAI/DeepSeek prefix cache keeps
the frozen system + prior history stable across turns. Only changed sections are re-injected
mid-run; a periodic refresh re-admits everything once the conversation grows past
`DEFAULT_REFRESH_MESSAGE_THRESHOLD` since the last admit. `findCutPoint` / `findCutPointByBudget`
skip synthetic `<ctx kind=...>` messages when counting `keepRecentFlows` / walking the budget.
After compaction / clear, `resetAdmittedTurnContext()` forces a fresh admission.

**Subagent isolation:** subagents run the same middleware but only `SUBAGENT_ALLOWED_KINDS`
(`current_date`, `git_status`, `project_instructions`) pass; memory / todo / plan / mode /
extension / instruction kinds are filtered. `project_instructions` for a subagent resolves
through the parent agent's agentDoc (`run-agent.ts` wiring) — agent-factory loads agentDoc
only for root agents.

**Provider cache wiring** (`prompt-cache-middleware`, `models/prompt-cache.ts`):

| Style                                 | Behavior                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic`                           | Split system at the boundary; `cache_control: ephemeral` on frozen system, last tool, and latest user message (≤3 of Anthropic's 4 breakpoints) |
| `openai` (and other Chat Completions) | `prompt_cache_key` = session id (or agent id), merged into `modelOptions`                                                                       |
| all                                   | Tools sorted by name before each request (`toolsToArray` + middleware)                                                                          |

### 7.4 Commit surfaced memories

**`lifecycle-middleware.onFirstModelOutput`** → `memory.commitSurfacedMemories()`:

- Adds prefetched filenames to `alreadySurfaced` so they are not re-injected next turn.

### 7.5 Post-run extraction & consolidation

**`MemoryService.runExtraction`** — async, fire-and-forget from `finalizeRun` when `reason === "finished"`:

```
Guard: manager exists, ≥8 messages, not already in progress
extractMemories → runSubagent → write .agents/memory/*.md files
  → emit memory:extract { status: start | complete | empty | queued | skip-short | error }
If count >= consolidateThreshold (default 25):
  consolidateMemories → merge/delete via subagent
  → emit memory:consolidate
flushIndex → update memory.content for next session
```

**Only runs after successful finish** — not on abort or error.

---

## 8. Event system (cross-cutting)

### 8.1 Emission

```typescript
emitAgentTelemetry(emitter, type, { data }); // injects session_id
managed.emitEvent(type, data);
```

### 8.2 Observation layers (L1–L4)

| Layer | Internal                                                                 | Host                                                                      |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| L1    | Status controller + ManagedAgent Emitter `change`                        | Session `state`                                                           |
| L2    | `AgentTelemetryBus` (+ Event→Log)                                        | Session `lifecycle` (filtered); `agentManager.on` for cross-agent / `"*"` |
| L3    | UIChannel Emitter `messages` + tool-output registry + `SummaryStreamHub` | Session `messages` / `tool` / `summary`                                   |
| L4    | `ExtensionEventBus` / ExtensionUI                                        | Not part of AgentSession                                                  |

**Host observation API:** `AgentSession` only (`createLocalAgentSession` / HTTP client) — `getSnapshot` / `dispatch` / `subscribe(channels)`. Domain classes expose typed `.on(...)` for Session projection and package-internal use; there is no parallel `ManagedAgent.observe()` facade.

Internal domain updates use a typed `Emitter` (todos, usage, L1 state, queues, plan, UI messages, log). Session channels project from those emitters; `lifecycle` projects a filtered `AgentTelemetryBus` set. Structured `log` is an opt-in session channel (not in default subscribe).

**Messages channel:** Session snapshots always carry a full `UIMessage[]`; the `messages` channel delivers the same full array (JSON-patch / delta delivery is deferred). Wire projection for the model loop is cached by channel revision + last-message fingerprint (`WireProjectionCache`).

Tool process chunks (`run_command` stdout/stderr) are scoped by required `agentId`; Session `tool` channel receives them (`chunk` / `clear`).
Task / compact summary text uses `ManagedAgent.summaryStreams` (`SummaryStreamHub`: `reset` / `append` / `end`) on Session `summary` — not the tool-output registry. Compact stream ids are stable (`compactSummaryStreamId(agentId)` → key `compact:${agentId}`).

### 8.3 Event types (summary)

| Category          | Events                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Session bootstrap | `session:doc`, `session:skill`, `session:mcp`, `session:memory`, `session:start`                                                       |
| Session I/O       | `session:restore`, `session:save-error`                                                                                                |
| Run lifecycle     | `prompt:submit`, `agent:thinking`, `agent:abort`, `agent:stream-error`, `agent:stop`                                                   |
| LLM iteration     | `llm:request`, `llm:response` — **per TanStack iteration**, not per user turn                                                          |
| Turn rollup       | `turn:summary` — end of `AgentChatController.pumpToolPhases`                                                                           |
| Tools             | `agent:tool-start`, `agent:tool-approval-request`, `agent:tool-end`, `agent:tool-error`                                                |
| Memory            | `memory:prefetch`, `memory:extract`, `memory:consolidate`                                                                              |
| Compaction        | `compaction:auto-*`, `compaction:reactive-*` (start kind matches path)                                                                 |
| Subagent          | `subagent:created`, `subagent:started`, `subagent:completed` (`summary`), `subagent:error`, `subagent:destroyed`, `subagent:ui-update` |

### 8.4 Event → Log bridge

**File:** `managers/event-log-bridge.ts`

- Attached in `AgentManager` constructor
- `DEFAULT_EVENT_LOG_RULES` controls level/category/message per event
- Complex events (MCP, memory, compaction) use dedicated log handlers (no UI notify)
- Emit sites should **not** duplicate `log.info` / `log.approval` for lifecycle events covered by the bridge

### 8.5 Extension interception (L4)

`ExtensionEventBus` (`tool:before:*` / `tool:after:*` / `tool:error:*` / `before_agent_start`) is invoked from middleware and prepare-for-run. It does **not** replace AgentTelemetryBus. There is **no** `.agent-hooks` / hook-script path — customize via `.agents/extension` modules or programmatic `config.extensions`.

The ExtensionEventBus also carries **session lifecycle events** (distinct from the L2 `session:start` telemetry): `session:start` (emitted at the end of `emitSessionBootstrapEvents`, payload `{ cwd, sessionId }`) and `session:shutdown` (emitted in `AgentManager.destroyAgent()` before `extensionRunner.destroyAll()`, so extensions can release resources first).

**Per-turn prompt hooks:** On each root user prompt (not tool continuations / subagents), `prepareForRun` calls `ExtensionRunner.collectBeforeAgentStart`, which:

1. Runs `before_agent_start` interceptors (observable event only — a fresh event per handler).
2. Runs each enabled extension's `registerContextProvider({ content })` (only non-empty content emits).
3. Emits each extension's turn-context text as its **own** `<ctx kind=<extension id>>` section in the dynamic turn snapshot (enable and disable share the same tag — an enabled extension carries its injected `content`, a disabled one carries only its `disabledContent` notice). Per-extension kinds keep the per-kind hash admission granular (only the changed extension re-injects, which is prompt-cache friendly).

There is no system-prompt append channel (`extension_system_append` was removed): extensions inject exclusively through `registerContextProvider`, so the frozen system prompt stays byte-stable and cacheable.

## Repo demos live in `examples/extensions/` and are **opt-in** via `AGENT_EXTENSION_DIRS`, `ManagedAgentConfig.extensionDirs`, or CLI `--extension-dirs` (not in core defaults). Extension `registerCommand()` is mirrored onto `ManagedAgent` and synced into app slash commands after bootstrap (`syncExtensionCommands`). Built-in names (`/help`, …) win over extension conflicts. `registerTool()` converts definitions via `defineServerTool` before they enter the TanStack tool set. Tool schemas may use **`ctx.z`** (host Zod) or any Standard-Schema / JSON-Schema-compliant schema (the `inputSchema`/`outputSchema` type is the widened `SchemaInput`). `tool:after:*` interceptors can set `event.payload.modifiedResult` to replace the model-facing result. `ExtensionUI.setStatus(key, text)` publishes a `set-status` notification the app footer renders, and `ctx.ui.theme.fg(color, text)` returns a plain (host-rendered) colored string. Each `ExtensionContext` also exposes `ctx.coreEnv` (the runtime CoreEnv: `rootPath`, `fs`, `runCommand`, `exec`, `fetch`, `path`, `getEnv`) so extensions do real I/O without importing host-specific APIs — `agent-factory.ts` wires it from the global `getEnv()`. `ExtensionRunner.getExtensionInfos()` + `setEnabled(id, enabled)` power the app **Extensions panel** (`Ctrl+Y`, list / toggle enable-disable); disabling calls `deactivate()` and unregisters the extension's tools, commands, interceptors, and turn-context providers (wired via `onUnregisterTool`/`onUnregisterCommand` → `ManagedAgent.unregisterExtensionTool/Command`).

## 9. End-to-end run diagram

```
User sends message (AgentChatController.sendMessage)
  │
  ▼
agentManager.runAgentStream(agentId, { messages: UIMessage[], abortSignal })
  │
  ▼
executeManagedAgentRun
  ├─ ensureAgentRunner (lazy build AgentRunner + middleware)
  ├─ prepareForRun
  │    ├─ (user-turn only) memory.prefetchRelevantMemories
  │    └─ (user-turn only) emit prompt:submit
  └─ runStreamWithReactiveCompactRetry
       └─ runner.run → TanStack chat()
            │
            ├─ [each iteration] compaction.onConfig → autoCompact if threshold exceeded
            │    (DeepSeek reasoning echo is adapter-only; no strip here)
            ├─ tool-compact.onConfig → toModelOutput + recent-window placeholders
            ├─ turn-context.onConfig → system prompt dynamic segment (turn snapshot)
            ├─ extensions.onBeforeToolCall → agent:tool-start (+ optional ExtensionEventBus)
            ├─ [tool execute or approval pause]
            ├─ extensions.onAfterToolCall → agent:tool-end/error (+ optional ExtensionEventBus)
            ├─ early-tool-result-ui.onAfterToolCall → AgentUIChannel.addToolResult (per-tool UI)
            └─ lifecycle.onFinish → llm:response (usage snapshot)
                 (turn finalizeRun is NOT here — see pump / detached below)
  │
  ▼
[core] AgentChatController.pumpToolPhases end (finished/aborted/error) → finalizeRun
[core] AgentChatController.stop → finalizeRun(aborted)
[core] run-subagent after detached outcome → finalizeRun
       ├─ session.persistSession (model state)
       ├─ memory.runExtraction (async, finished only)
       └─ emit agent:stop
  │
  ▼
[core] user send / drained queues → maybeSaveSessionUIMessages(..., "user-message")
[core] pump idle / abort cleanup → maybeSaveSessionUIMessages(..., "pump-complete")
[core] finalizeRun / /compact → persistSession() (model fields only)
[app] /clear etc. → saveSessionUIMessages() (force)
```

---

## 10. Plan domain vs tool factories

| Concern                                                                               | Location      | Examples                                                                          |
| ------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| Plan **domain** (phase machine, prompts, safe-command, verification gate, middleware) | `agent/plan/` | `PlanModeController`, `plan-mode-middleware`, `plan-prompts`, `plan-verification` |
| Plan **tool factories** (model-callable tools)                                        | `agent/plan/` | `create-plan-tool` (`create_plan` / `update_plan` / `complete_plan`)              |

Domain-owned tools live next to their domain (same pattern as `subagent/begin-summary-tool` and `subagent/task-tool`). Universal workspace tools stay under `agent/tools/`.

**Verification contract:** `create_plan` / `update_plan` require a non-empty `verification` checklist (content quality is prompt guidance, not a hardcoded command blacklist). Plan markdown gets a `**Verification:**` section. In retro, `complete_plan` requires `verificationResults: { item, passed, evidence }[]` covering every parsed checklist item (all `passed: true`). Legacy plans with no Verification section accept a single passing smoke/N/A result. User `/mode done` bypasses the agent gate. Helpers: `parseVerificationItemsFrom*`, `gateCompletePlanVerification`. Validate: `pnpm --filter @my-agent/core run validate:plan-verification`.

---

## 11. Key file index

| Area                | Primary files                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry / connect     | `index.ts`, `agent-session/*`                                                                                                                |
| Manager             | `managers/agent-manager.ts`, `managers/agent-factory.ts`                                                                                     |
| Agent runtime       | `managers/managed-agent.ts`, `managers/run-agent.ts`, `managers/agent-run-outcome.ts`                                                        |
| Stream recovery     | `managers/run-stream-recovery.ts`, `managers/stream-recovery/*`                                                                              |
| Runner              | `agent/runner/agent-runner.ts`                                                                                                               |
| Middleware          | `managers/middleware/*.ts` (+ `agent/plan/plan-mode-middleware.ts`)                                                                          |
| Stream helpers      | `agent/stream/*`                                                                                                                             |
| UI channel          | `agent/ui-channel.ts`                                                                                                                        |
| Shared types        | `runtime-types/*`                                                                                                                            |
| Telemetry           | `managers/agent-telemetry-bus.ts`, `managers/emit-agent-telemetry.ts`, `managers/event-log-bridge.ts`                                        |
| Persistence         | `managers/session-service.ts`, `agent/persistence/session-store.ts`                                                                          |
| Cross-cutting utils | `utils/emitter.ts`, `utils/generate-id.ts`                                                                                                   |
| Domain helpers      | `agent/run-helpers/*` (tool-phase, empty-stream, pending queue — stay with chat/run)                                                         |
| Memory              | `managers/memory-service.ts`, `agent/memory/*.ts`                                                                                            |
| Compaction          | `agent/compaction/*.ts`                                                                                                                      |
| Plan                | `agent/plan/*` (domain + plan tool factories)                                                                                                |
| Tools               | `agent/tools/*.ts` (universal), `agent/tools/runtime/define-tool.ts`; domain tools under `plan/` / `skills/` / `subagent/` / `todo-manager/` |
| Subagent            | `agent/subagent/run-subagent.ts`, `agent/subagent/task-tool.ts`                                                                              |
| Models              | `models/model-config.ts`, `models/adapter-factory.ts`, `models/prompt-cache.ts`                                                              |
| CoreEnv             | `env.ts` (+ `@my-agent/node` / `@my-agent/server`)                                                                                           |

---

## 12. Validation scripts

```bash
pnpm --filter @my-agent/core run validate:emit-agent-event
pnpm --filter @my-agent/core run validate:event-log-bridge
pnpm --filter @my-agent/core run validate:extensions-middleware
pnpm --filter @my-agent/core run validate:agent-ui-channel
pnpm --filter @my-agent/core run validate:suppress-replayed-tool-chunks
pnpm --filter @my-agent/core run validate:early-tool-result-ui
pnpm --filter @my-agent/core run validate:extension-prompt-hooks
pnpm --filter @my-agent/core run validate:extension-pi-like
pnpm --filter @my-agent/core run validate:streaming-scope
pnpm --filter @my-agent/core run validate:summary-stream
pnpm --filter @my-agent/core run validate:local-agent-session
pnpm --filter @my-agent/core run validate:run-agent-skeleton
pnpm --filter @my-agent/core run validate:tanstack-tools
pnpm --filter @my-agent/core run validate:compaction-messages
pnpm --filter @my-agent/core run validate:message-chain-projection
pnpm --filter @my-agent/core run validate:suppress-messages-snapshot
pnpm --filter @my-agent/core run validate:reactive-compact
pnpm --filter @my-agent/core run validate:run-stream-recovery
pnpm --filter @my-agent/core run validate:agent-run-finalization
pnpm --filter @my-agent/core run validate:agent-managers-boundary
pnpm --filter @my-agent/core run validate:models-managers-boundary
pnpm --filter @my-agent/core run validate:agent-status
pnpm --filter @my-agent/core run validate:prompt-cache
pnpm --filter @my-agent/core run validate:subagent-run-stats
pnpm --filter @my-agent/core run validate:model-config
pnpm --filter @my-agent/core run validate:tool-phase-utils
pnpm --filter @my-agent/core run validate:session-sync-tracker
pnpm --filter @my-agent/core run validate:tool-approval-resume
pnpm --filter @my-agent/core run validate:restore-session-chat-state
```

Full package validation: `pnpm build:core` + `pnpm typecheck` (core tools typecheck clean as of recent fixes).
