<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# AGENTS.md - AI Agent Guidelines

This file provides guidelines for AI coding agents working in this repository.

## Project Overview

A pnpm monorepo with eight packages organized in a layered architecture.

**Core runtime deep-dive:** [packages/core/ARCHITECTURE.md](packages/core/ARCHITECTURE.md) — startup, initialization, session/memory/compaction/approval flows.

| Package | Role |
|---------|------|
| `@my-agent/core` | Runtime-agnostic core: agent loop, tools, LLM model factory, CoreEnv interface |
| `@my-agent/app` | Shared UI layer: React components, hooks, commands, AgentAdapter interface. **Session-only** for agent control — keeps a live-session registry (`sessions`/`activeSessionId` + `registerSession`/`activateSession`) so multiple live agents can coexist and be switched. See [`packages/app/README.md`](packages/app/README.md) import allowlist |
| `@my-agent/cli` | Terminal host — thin shell that registers CoreEnv and renders `@my-agent/app` |
| `@my-agent/node` | Node.js CoreEnv implementation: native filesystem, shell, OS sandbox |
| `@my-agent/server` | CoreEnv HTTP server (Hono RPC) + remote client factory |
| `@my-agent/extension` | Chrome extension host using WXT framework |
| `@my-agent/playground` | In-browser WebContainer host (Vite) |
| `@my-agent/mcp-server` | MCP server for external tool integration |
| `@my-agent/im-bridge` | Generic IM bridge (Telegram adapter) — a headless AgentSession client like the remote CLI; no CoreEnv/ModelProvider of its own |

## Architecture

### Layered Design

```
┌─────────────────────────────────────────────────────────┐
│  Runtime Hosts                                          │
│  ┌──────────────────┐  ┌────────────────────────────┐   │
│  │  @my-agent/cli   │  │  @my-agent/extension       │   │
│  │  (Ink terminal)  │  │  (WXT Chrome extension)    │   │
│  └────────┬─────────┘  └─────────────┬──────────────┘   │
│           │     AgentAdapter          │                  │
│           │  (+ playground WebContainer host)            │
│  ┌────────┴───────────────────────────┴──────────────┐   │
│  │  @my-agent/app  (Session-only UI, hooks, commands)│   │
│  └────────────────────────┬──────────────────────────┘   │
│                           │  AgentSession                │
│  ┌────────────────────────┴──────────────────────────┐   │
│  │  @my-agent/core  (agent loop, tools, CoreEnv)     │   │
│  └────────────────────────┬──────────────────────────┘   │
│                           │  CoreEnv interface           │
│  ┌────────────────────────┴──────────────────────────┐   │
│  │  CoreEnv Adapter Layer                            │   │
│  │  ┌──────────────────┐  ┌────────────────────────┐ │   │
│  │  │ @my-agent/node   │  │ @my-agent/server       │ │   │
│  │  │ (local Node.js)  │  │ (remote HTTP client)   │ │   │
│  │  └──────────────────┘  └───────────┬────────────┘ │   │
│  └────────────────────────────────────┼──────────────┘   │
│                                       │ Hono RPC         │
│  ┌────────────────────────────────────┴──────────────┐   │
│  │  @my-agent/server (HTTP server, uses @my-agent/node)  │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### CoreEnv — Runtime Abstraction

`CoreEnv` is the central abstraction that decouples `@my-agent/core` from any specific runtime. All filesystem, shell, fetch, and platform APIs go through this interface.

```typescript
interface CoreEnv {
  rootPath: string;                // Workspace root
  path?: CoreEnvPath;              // Synchronous path utilities (defaults to pathe/POSIX)
  getPlatform(): Promise<string>;  // Async — may query remote server
  getArch(): Promise<string>;
  getEnv(): Promise<Record<string, string | undefined>>;
  homedir(): Promise<string>;
  fs: CoreEnvFs;                   // Filesystem operations
  runCommand(cmd, opts?): Promise<CommandResult>;
  exec(cmd, opts?): Promise<CoreEnvExecResult>;
  fetch(input, init?): Promise<Response>;
  destroy?(): Promise<void>;       // Lifecycle cleanup
  // Optional: byteLength, base64Encode/Decode, getMimeType, createMCPStdioTransport,
  //           createLspConnection, createIsolateDriver (code-mode TS sandbox backend)
}
```

**Registry pattern:**
```typescript
import { registerCoreEnv, getEnv, clearCoreEnv, hasCoreEnv } from "@my-agent/core";

registerCoreEnv(env);   // Set the global CoreEnv (must be called before any core usage)
getEnv();               // Get resolved env with defaults applied
clearCoreEnv();         // Clear the registry (call on disconnect/destroy)
hasCoreEnv();           // Check if registered
```

**Implementations:**
- `createNodeEnv()` from `@my-agent/node` — local Node.js APIs, optional OS sandbox
- `createRemoteEnv(url)` from `@my-agent/server/client` — HTTP RPC to a remote CoreEnv server

### ModelProvider — LLM plane (orthogonal to CoreEnv)

LLM credentials are **not** part of CoreEnv. Hosts register a `ModelProvider` separately so local/remote workspace and local/remote keys combine freely.

```typescript
import {
  registerModelProvider,
  createDirectModelProvider,
  resolveModelConfigFromProvider,
} from "@my-agent/core";
import { createRemoteProvider } from "@my-agent/server/client";

registerModelProvider(createDirectModelProvider({ model, style, baseURL, apiKey }));
// or
registerModelProvider(await createRemoteProvider("http://localhost:3100"));
```

| Flag / Env | Plane | Client boundary |
|------------|--------|-----------------|
| `--remote-env` / `REMOTE_ENV` | CoreEnv workspace | combines freely with `--remote-provider` |
| `--remote-provider` / `REMOTE_PROVIDER` | Remote model provider | combines freely with `--remote-env` |
| `--remote-session` / `REMOTE_SESSION` | Remote Agent Session | **exclusive** — cannot combine with the other two on one client; use `--model <id>` to push local LLM settings to the server |

The exclusivity is a **client** rule: a server (`pnpm start:server`) may itself register `REMOTE_ENV` (remote workspace; `REMOTE_PROVIDER` forwarding planned) so a `--remote-session` server chains further remote planes.

`createAgentFromConfig` uses `resolveModelConfigFromProvider()`. Remote mode forces `baseURL`/`apiKey` from the provider (re-forced after models.dev so upstream URLs cannot bypass). `/api/env/vars` strips `API_KEY` / `*_API_KEY`. Footer shows `model · remote` when `providerMode === "remote"`.

### AgentAdapter — Host Abstraction

Each host (CLI, extension) provides an `AgentAdapter` implementation:

```typescript
interface AgentAdapter {
  initialize(config: AppConfig): Promise<InitResult>;
  createTransport(): ChatTransport<UIMessage>;
  destroy(): Promise<void>;
  exit(): void;
  readClipboardImage?(): Promise<ClipboardImageResult | null>;
}
```

Shared initialization logic is in `createAgentFromConfig()` (`@my-agent/app/adapter/create-agent.ts`). Both `LocalAgentAdapter` (CLI) and `ExtensionAgentAdapter` delegate to this helper. `initConfig` must keep host fields such as `toolConfig` (Brave / websearch) and `remoteSession` so they reach `Host.create`. The CLI `LocalAgentAdapter` tracks live sessions through the host and, on `destroy`, iterates `host.list()` to tear down **every** live agent owned by the host (the bootstrap session plus any created via `createSessionOnHost`) so no agent leaks on exit.

### Bootstrap Sequences

**CLI (local):**
```
loadEnv → parseCliArgs → registerCoreEnv(createNodeEnv) → registerModelProvider(direct) → initConfig → render(App)
```

**CLI (remote planes):**
```
loadEnv → parseCliArgs
  → [guard] --remote-session + (--remote-env | --remote-provider) → error + exit(1) (exclusive)
  → [--remote-env] createRemoteEnv → registerCoreEnv
  → [--remote-session] createRemoteEnv(server URL) → registerCoreEnv  (workspace panel = server fs)
  → else createNodeEnv → registerCoreEnv
  → [--remote-provider] createRemoteProvider → registerModelProvider
  → [--remote-session w/o explicit model] defer model resolution to server
  → else createDirectModelProvider → registerModelProvider
  → initConfig → render(App)
```

**Extension:**
```
ConnectionGuard(/health) → createRemoteEnv(url) → registerCoreEnv
  → apiKey ? direct : createRemoteProvider(url) → registerModelProvider
  → initConfig → render(App)
```

### @my-agent/core Public API

`packages/core/src/index.ts` exports a **curated** surface for hosts and adapters — not a barrel of every internal module:

| Category | Examples |
|----------|----------|
| CoreEnv | `registerCoreEnv`, `getEnv`, `CoreEnv` types |
| ModelProvider | `registerModelProvider`, `createDirectModelProvider`, `resolveModelConfigFromProvider` |
| Runtime | `agentManager`, `AgentManager`, `ManagedAgent`, `AgentSession` / `AgentSessionHost` |
| UI / state | Session-safe types (`TodoItem`, `LogEntry`, …); `AgentLog`/`TodoManager`/`SessionStore` classes are package-private |
| Compaction | Session `compact` command; executors (`autoCompact`, …) stay on `dev.ts` |
| Bootstrap | `buildDefaultSystemPrompt`, `resolveModelConfig`, `resolveModelConfigFromProvider` |
| UI helpers | `previewEdit`, AgentSession `tool` channel (run_command stdout/stderr), tool output types |
| Adapters | `FileError`, `ExecutionError`, `generateId` |

Internal modules (tools, middleware, subagent runner, hook registry, session-sync / tool-phase helpers, etc.) stay package-private. Core validation scripts import from `dist/dev.mjs` (`src/dev.ts`), which is not part of the published package export map. See `openspec/changes/harden-core-organization/API-REMOVALS.md` for the latest public-entry removals.

### TanStack AI Integration

`@my-agent/core` uses **TanStack AI** (`@tanstack/ai`, provider adapters) for agent execution.

Key integration points:
- `core/src/models/model-config.ts` — connection resolution (`openai` | `anthropic` style, baseURL, apiKey, models.dev metadata)
- `core/src/models/adapter-factory.ts` — TanStack text adapters (`createOpenaiChatCompletions`, `createAnthropicChat`)
- `core/src/managers/run-agent.ts` — `AgentRunner` + `chat()` stream, compaction middleware
- `core/src/agent/compaction/` — Channel convert + summary-first wire projection (`getModelVisibleMessages`); engine messages are ephemeral
- `core/src/agent/ui-channel.ts` — Durable UIMessage chain (SoT); compaction appends SUMMARY here
- `core/src/agent/mcp/` — MCP via `@tanstack/ai-mcp` (`McpManager` re-wraps tool execute so multimodal `content[]` is not dropped when `structuredContent` is present)
- `app/src/hooks/use-agent-chat.ts` — React hook via Session `dispatch` / subscribe (no ManagedAgent)

## Build, Lint, Test Commands

```bash
pnpm install          # Install dependencies

pnpm build            # Build all packages (core → app → rest)
pnpm build:core       # Build core package only
pnpm build:app        # Build app package only
pnpm build:cli        # Build CLI package only
pnpm build:server     # Build server package only
pnpm build:extension  # Build extension only

pnpm dev              # Run all packages in watch mode (parallel)
pnpm dev:core         # Watch core package
pnpm dev:app          # Watch app package
pnpm dev:cli          # Watch CLI package
pnpm dev:server       # Watch server package
pnpm dev:extension    # Run extension dev server
pnpm start:cli        # Run CLI after build
pnpm start:server     # Run CoreEnv HTTP server

pnpm typecheck        # Type check all packages
pnpm lint             # Run ESLint
pnpm format           # Format with Prettier
```

Per-package type check: `cd packages/<pkg> && pnpm tsc --noEmit` (e.g. `core`, `app`, `cli`).

## Code Style Guidelines

### Formatting (Prettier)
- Double quotes for strings (`"string"`)
- Semicolons required
- 2 space indentation, no tabs
- 120 character line width
- Trailing commas in ES5 contexts

### TypeScript
- Target: ES2022
- Strict mode enabled
- ESM modules (`"type": "module"`)
- Use `.js` extensions in imports for local files (ESM requirement)

### Import Order & Style
```typescript
import { tool } from "ai";                     // 1. External (no extension)
import { z } from "zod";

import { resolveModelConfig } from "./models/model-config.js";  // 2. Local (.js)

import type { AppConfig } from "./adapter/types.js";  // 3. Type-only (local first, then external, alphabetical)
import type { LanguageModel, ToolSet } from "ai";
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (general) | kebab-case | `use-agent.ts`, `read-file-tool.ts` |
| Files (React) | PascalCase | `App.tsx`, `Header.tsx` |
| Functions | camelCase | `createTools`, `getFile` |
| Factory functions | `create*` prefix | `createAgent`, `createModel` |
| Hooks | `use*` prefix | `useAgent`, `useConfig` |
| Types/Interfaces | PascalCase | `AgentConfig`, `ToolCallInfo` |
| Zod schemas | camelCase + Schema | `agentConfigSchema` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_LOCAL_OPENAI_BASE_URL` |

### Core Naming Conventions (packages/core)

Rules that keep `packages/core` internally consistent. Deviations need a reason in the PR.

**Files**

- kebab-case, and the name must state the module's responsibility — avoid generic
  placeholders (`helpers.ts`, `output.ts`, `prompt.ts`, `tools.ts`) for non-trivial modules.
- Built-in extensions live at `<domain>/extension.ts` (e.g. `agent/skills/extension.ts`,
  `agent/lsp/extension.ts`). The extension *framework* itself lives in `agent/extension/`.

**Exports**

- Built-in extension factories: exactly one canonical export `createXxxExtension`. No bare-name aliases, no default exports.
- Internal renames land directly — no old-path re-exports, deprecated aliases, or staged dual exports; call sites switch in the same change.

**Class members / accessors**

- No underscore-prefixed members (`_status` ✗ → `currentStatus` ✓). Getter backing fields use descriptive names.
- Read accessors: property-like hot reads may be getters (`get status`); everything else uses `getXxx()` / `setXxx()` methods. Pick one form per feature area and stay consistent.

**Barrels**

- Domain directories expose `index.ts`; import from the directory root when consuming 2+
  symbols from it. The top-level `src/agent/` namespace is intentionally barrel-free —
  cross-domain imports use direct module paths there.

**File size**

- Keep files ≤ 400 lines where a cohesive boundary exists (`.cursor/rules/040`). Files that
  legitimately exceed it (`managed-agent.ts` as composition root) document the trade-off
  instead of being cut arbitrarily.

### Error Handling
```typescript
try {
  const result = await someOperation();
  return result;
} catch (error) {
  const err = error instanceof Error ? error : new Error(String(error));
  onError?.(err);
  throw err;
}
```

**Typed errors:** Use `FileError` / `ExecutionError` (from `@my-agent/core`) for structured errors across local/remote boundaries — they serialize/deserialize over HTTP.
```typescript
import { FileError, ExecutionError } from "@my-agent/core";
throw new FileError("not_found", "File not found", "/path/to/file");          // fs
throw new ExecutionError("timeout", "Command timed out after 30s");            // exec
```

### State Management (reactivity-store)
Uses Zustand-like API:
```typescript
export const useAgent = createState(() => ({ status: "idle", error: "" }), {
  withActions: (state) => ({
    setStatus: (status: string) => {
      state.status = status;  // Direct mutation allowed
    },
  }),
});

// Usage in components
const status = useAgent((s) => s.status);           // Reactive selector
const { setStatus } = useAgent.getActions();        // Non-reactive actions
```

### Tool Definition Pattern
```typescript
export const createReadFileTool = () => {
  return tool({
    title: "read-file-tool",
    description: "Read file contents",
    inputSchema: z.object({
      path: z.string().describe("File path to read"),
      offset: z.number().int().min(0).optional(),
    }),
    outputSchema: z.object({
      content: z.string(),
    }),
    execute: async ({ path }, { abortSignal }) => {
      const env = getEnv();
      const content = await env.fs.readFile(path);
      return { content };
    },
  });
};
```

### React Components
```typescript
export const MyComponent = () => {
  const config = useConfig((s) => s.config);

  return (
    <Box flexDirection="column">
      <Text>{config.model}</Text>
    </Box>
  );
};
```

### Documentation Style
Use JSDoc with examples for public APIs:
```typescript
/**
 * Create a new agent instance
 * @example const agent = await agentManager.createManagedAgent({ name: "main", model: "gpt-4o" });
 */
```

Use section separators in large files:
```typescript
// ============================================================================
// Types & Schemas
// ============================================================================
```

## Key Technologies

### Core & App
- **TanStack AI** (`@tanstack/ai`, `@tanstack/ai-client`, provider adapters) — LLM agent loop and streaming
- **@tanstack/ai-client** — used inside core chat controller / stream wiring; app talks Session
- **Zod** (v4.x) — Schema validation
- **pathe** — Cross-runtime POSIX path utilities
- **reactivity-store** — State management (Zustand-like API)
- **tsdown** — TypeScript build tool
- **shiki** / **ink-stream-markdown** — Syntax highlighting and markdown rendering
- **@git-diff-view** — Git diff visualization

### CLI
- **@my-react/react-terminal** — React for terminal UIs
- **ink** — Terminal rendering (aliased from @my-react/react-terminal)

### Node
- **@anthropic-ai/sandbox-runtime** — OS-level sandbox for command execution
- **mime-types** — MIME type detection
- **@ai-sdk/mcp** — MCP stdio transport

### Server
- **Hono** — HTTP framework
- **@hono/zod-validator** — Request validation
- **hono/client** (RPC) — Type-safe client generation

### Extension
- **WXT** — Browser extension framework
- **@heroui/react** — UI component library
- **tailwindcss** (v4.x) — CSS framework

## Agent Session API (host-facing)

Hosts should prefer `AgentSession` (`getSnapshot` / `dispatch` / `subscribe`) over reading `ManagedAgent` fields. Local: `createLocalAgentSession`. HTTP: `@my-agent/server/agent-session` / `@my-agent/server/client`'s `createRemoteAgentSessionHost` against `/api/agent/*`. Subagents reuse the same Session contract by id.

**Host-owned session plane:** hosts construct the `AgentSessionHost` (local manager, or remote HTTP when `--remote-session`) and inject it into `createAgentFromConfig`; the UI layer never imports core runtime singletons (enforced by app's `validate:core-imports`). Remote client features: SSE auto-reconnect with exponential backoff, server heartbeat ping + client watchdog, remount seeds (`/tool-buffers`, `/summary-streams`) so in-flight tool output and summary streams survive reconnects; state channel carries `name`, so commands sync without full-snapshot refetch.

Internal domain updates use a typed `Emitter` (todos, usage, state, queues, plan, messages, log). Hosts subscribe via `AgentSession` channels projected from those Emitters; `lifecycle` projects a filtered `AgentTelemetryBus` set. Opt-in `log` channel is excluded from default subscribe. Domain classes expose `.on(...)` for internal Session projection — not a parallel host observation API.

**TODO:** message channel currently delivers full `UIMessage[]` (incremental/patch later).

## CoreEnv Server (Remote Mode)

The `@my-agent/server` package exposes CoreEnv APIs over HTTP using Hono RPC for end-to-end type safety. Agent Session routes are a **separate plane** under `/api/agent/*` (not CoreEnv).

### Server Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Health check, returns rootPath and sandbox mode |
| `/api/env/info` | GET | Platform info: rootPath, platform, arch, homedir, sep |
| `/api/env/vars` | GET | Environment variables (sensitive vars filtered) |
| `/api/env/destroy` | POST | Lifecycle cleanup |
| `/api/fs/*` | POST | Filesystem operations (readFile / writeFile with optional base64 encoding for binary, etc.) |
| `/api/command/run` | POST | Run a shell command |
| `/api/command/exec` | POST | Execute a simple command |
| `/api/fetch/proxy` | POST | HTTP fetch proxy (handles binary via base64; not for LLM SSE) |
| `/api/provider/info` | GET | Remote model provider metadata (style, model, proxy basePath; no secrets) |
| `/api/provider/openai/*` | ALL | Streaming OpenAI-compatible proxy (injects server `API_KEY`; strips `Content-Encoding` after undici decode) |
| `/api/provider/anthropic/*` | ALL | Streaming Anthropic proxy (injects server `x-api-key`; same encoding strip) |
| `/api/mcp/init` | POST | Create a new MCP stdio process session |
| `/api/mcp/:id/message` | POST | Send a JSON-RPC message to an MCP session |
| `/api/mcp/:id` | DELETE | Clean up an MCP stdio process session |
| `/api/agent` | GET | Catalog list (mirrors `AgentSessionHost.list()`) |
| `/api/agent` | POST | Create/bind AgentSession (full create options incl. maxIterations/mcp/toolConfig/resume) |
| `/api/agent/:id/snapshot` | GET | AgentSession snapshot (root or subagent id) |
| `/api/agent/:id/command` | POST | `dispatch(command)` |
| `/api/agent/:id/events` | GET | SSE session channels (+ 15s heartbeat ping frames) |
| `/api/agent/:id/tool-buffers` | GET | Buffered tool stdout/stderr per toolCallId (remount) |
| `/api/agent/:id/summary-streams` | GET | Live SummaryStreamHub snapshots (remount/cache seed) |
| `/api/agent/:id` | DELETE | Close session |

### Client Usage

```typescript
import { registerCoreEnv, registerModelProvider, createDirectModelProvider } from "@my-agent/core";
import { createRemoteEnv, createRemoteProvider } from "@my-agent/server/client";

registerCoreEnv(await createRemoteEnv("http://localhost:3100"));
registerModelProvider(await createRemoteProvider("http://localhost:3100"));
// Or local keys with remote workspace:
// registerModelProvider(createDirectModelProvider({ model, style, baseURL, apiKey }));
```

### Known Limitations
- `runCommand` mid-run streaming is lost over HTTP — chunks are not pushed live; the remote client delivers full stdout/stderr once when `/api/command/run` returns (UI/tool still get the final output)
- Binary fetch responses are base64-encoded over the wire
- Provider proxy assumes a trusted network (no extra auth on `/api/provider/*` in v1)
- Provider proxy `/api/provider/*` fetch failures return OpenAI `{ error: { message, type, code } }` (not `{ error: true }`); the **server host** must be able to reach its `BASE_URL`
- LLM adapters still use global `fetch` against the proxy `baseURL` (not `CoreEnv.fetch`)

## Agent Event System

`AgentManager` owns an `AgentTelemetryBus` for lifecycle telemetry. Emit via `emitAgentTelemetry()` / `ManagedAgent.emitEvent()`; subscribe with `agentManager.on(type, listener)`.

| Event | When emitted |
|-------|----------------|
| `session:doc` / `session:skill` / `session:mcp` / `session:memory` | After agent registration during bootstrap |
| `session:start` | Bootstrap complete |
| `prompt:submit` | Run prepared |
| `prompt:before` | Extension `before_agent_start` / turn-context providers collected |
| `agent:thinking` | Model reasoning stream starts |
| `agent:tool-start` / `agent:tool-end` / `agent:tool-error` | Tool lifecycle (extensions middleware) |
| `agent:retry` | Recoverable LLM failure being retried (429/gateway backoff, capability strip, reactive compact, max_tokens continuation); payload carries `attempt`/`maxAttempts`/`strategy`/`error`/`delayMs`. Retry state also lives on the Session snapshot + `state` channel (`AgentRetryState`) and is cleared once the stream recovers or the run reaches a terminal status |
| `agent:abort` / `agent:stream-error` | User abort / stream failure (`RUN_ERROR`, empty-stream guard, and other pump failures; main chat records error without crashing the host) |
| `agent:stop` | Run finished or aborted |
| `memory:prefetch` | Relevant memory injection before run |
| `memory:extract` / `memory:consolidate` | Post-run memory extraction |
| `compaction:auto-*` / `compaction:reactive-*` | Auto / reactive context compaction |
| `session:save-error` | Session persistence failure |
| `subagent:*` | Subagent lifecycle |
| `plan:enter` / `plan:ready` / `plan:execute` / `plan:cancel-execution` / `plan:retro` / `plan:complete` / `plan:exit` | Plan mode phase transitions |

**Vision note:** On OpenAI-compatible Chat Completions, multimodal tool results are lifted to a synthetic user `image_url` message (`liftToolMediaForChatCompletions`) so base64 is not stringified into `role: "tool"`. Anthropic keeps native multimodal `tool_result` parts. Official DeepSeek Chat Completions may still reject `image_url` (text-only schema); capability sanitization strips unsupported `image` / `audio` / `video` / `document` parts on the wire and retries once — use a vision-capable provider for real media understanding. Session/UI history always keeps structured image parts (and `.agents/media` binary files); wire stripping must not change persisted message shape.

**Event → Log bridge:** `bridgeTelemetryToAgentLog()` in `AgentManager` maps telemetry events to `AgentLog` entries. Policy lives in `event-log-bridge.ts` (`DEFAULT_EVENT_LOG_RULES`); override per event type with `EventLogPolicy`. Emit sites should not duplicate lifecycle logs covered by events.

## Prompt Cache (prefix)

Frozen system text ends with `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` and stays byte-stable across turns.
Per-turn dynamic context is injected as synthetic `<ctx kind=...>` user messages by the turn-context middleware `onConfig` (after compaction) whenever a section's content hash changes (persisted in `uiMessages`, hidden in the transcript UI; per-kind supersede notices mark refreshed sections).
`<current_date>` uses **day** granularity (not hour/minute) so the payload stays stable within a calendar day.
`findCutPoint` / `findCutPointByBudget` skip synthetic `<ctx kind=...>` messages (turn counting / budget walk respectively).
All synthetic injections (turn-context sections, memory, background-command completion notifications) share one helper (`managers/middleware/synthetic-injection.ts`): stable `ctx-<kind>-<hash>` ids, channel + wire in sync, persisted to the session (no cross-turn prefix divergence). Background notifications use `append` position and `<ctx kind=background_notification>`; any future injection must reuse this helper and shell.
`prompt-cache-middleware` then:

- **Anthropic** — `cache_control: { type: "ephemeral" }` on frozen system, last tool definition, and latest user message (tool-loop friendly)
- **OpenAI-compatible** — `prompt_cache_key` from session id (≤64 chars)
- **All styles** — tools sorted by name for stable schemas

Helpers: `packages/core/src/models/prompt-cache.ts`. Validate: `pnpm --filter @my-agent/core run validate:prompt-cache`.

## Plan Mode

Cursor-like lifecycle: explore → review → Build → forced retro → complete (exit).

| Phase (internal) | UI label | Tools | Behavior |
|------------------|----------|-------|----------|
| `planning` | planning | Mutate tools + MCP hidden; `task` allowed; `create_plan` / `update_plan` offered; `run_command` allowlisted | Explore (prefer `task`), clarify if needed, call `create_plan` (or `## Plan` fallback). **verification** required (non-empty outcome checklist). Judge `task` via status flags (`reachedLimit` / `incomplete` / `aborted` / `truncated`) before treating research as extendable. Auto-saves under `.agents/plans/`. |
| `ready` | review | Same read-only restrictions | User reviews; revise via chat + `update_plan` (verification still required). `/mode execute` = Build (no extra confirm). |
| `executing` | building | Full tools (`create_plan` / `update_plan` / `complete_plan` hidden); pending approvals auto-approved while seeded | Follow plan; run Verification with evidence before finishing. Session persists `planMode` + `todoPlanBound`. |
| `retro` | retro | Full tools + `complete_plan` | Forced retrospective; `complete_plan` requires `verificationResults` covering every checklist item (all passed). `/mode done` force-exits without that gate. |
| `off` | — | Plan authoring/completion tools hidden | Default |

**App:** `Shift+Tab` cycles modes (normal → auto → plan → normal → …); `/mode` is the slash-command entry point (contextual menu + subcommands `plan` / `auto` / `off` / `switch plan` / `switch auto` / `status` / `execute` / `done` / `cancel` / `save` / `load` / `list`; empty `/mode` cycles like `Shift+Tab`). When **review** (`ready`), press `p` (empty input) to toggle a bordered markdown plan preview in the banner (`Esc` closes). `/mode execute` Builds from review; `/mode cancel` pauses building → review; `/mode done` finishes retro (user force — no agent verification gate); `/mode status` reports phase; `/mode save` / `load` / `list` for named persistence (create/update already auto-save). Footer shows mode name (`Normal` / `Auto` / `planning` / `review · /mode execute` / `building n/m` / `retro`). `create_plan` / `update_plan` do not dump plan text into the tool transcript — review is via the banner preview.

**Core:** `ManagedAgent.planMode` (`PlanModeController`), tool filter in `run-agent`, `createPlanModeMiddleware`, prompts via turn context, `plan-verification` parse/gate helpers. See `packages/core/src/agent/plan/`. Validate: `pnpm --filter @my-agent/core run validate:plan-verification`.

**Auto mode:** `/mode auto` skips all tool approvals. Footer shows `Auto`. Mutually exclusive with plan mode (entering one clears the other). Cleared on `/clear` / reset; persisted as `SessionData.autoMode` (legacy sessions may still have `autoApprove`). While auto is on, turn context includes an `<auto_mode>` block.

**Session / safety:** `/clear` and `ManagedAgent.reset()` always `planMode.disable()`, turn off auto mode, and clear the session `approvals` table. Resume restores `planMode` + `autoMode` with plan winning if both were somehow set, and restores `approvals` (or backfills from UIMessage parts when the field is missing). Chat `onConfig` rebuilds TanStack `resumeToolState.approvals` from that table so approved/denied tools do not re-prompt. Plan building auto-approve still requires `executing` **and** `todosSeeded` (separate from `/mode auto`).

## Subagent System

The project supports **subagents** — context-isolated agents spawned to handle delegated tasks.

**Run profiles:** InteractiveChat (`AgentChatController` pump) and Worker (`runSubagent`) share `runAgentOnce` / `consumeAgentStream` in `agent/run/run-agent-skeleton.ts`. Workers use outcome path `"detached"`; chat finalizes with `"chat"` after the full pump. Hosts still observe via `AgentSession` only.

### Subagent Characteristics

| Feature | Behavior |
|---------|----------|
| Context | Fresh (starts with empty messages) |
| Tools | Read-only: `read_file`, `glob`, `grep`, `list_file`, `tree`, `websearch`, `webfetch`, plus marker `begin_summary` (no `run_command` / write tools) |
| Return | Summary only to parent LLM context; UI keeps a read-only UIMessage preview when `bridgeUI` is enabled |
| Iteration Limit | 50 steps max (TanStack `maxIterations`; cutoff leaves `finishReason: tool_calls`) |
| Status flags | `toModelOutput` exposes `reachedLimit` / `incomplete` / `aborted` / `truncated`; explore runs require `begin_summary` for a complete result |
| Summary Limit | 5000 characters max |

| UI Preview | `bridgeUI: true` (default when `parentTaskToolCallId` is set): parent panel + task-tool streaming via the subagent’s `AgentUIChannel` |
| No parent bridge | `bridgeUI: false` (default otherwise): still has an internal `AgentUIChannel` (message SoT); skips `subagent:ui-update` / task-tool streaming — used by compaction and memory subagents |

### Subagent UI Preview

`runSubagent` always attaches an `AgentUIChannel` via `ensureUIChannel`.
`bridgeUI: true` enables the task panel (`Ctrl+T`) and parent streaming ids;
`bridgeUI: false` keeps the channel internal only.
Task-tool subagents use `autoDestroy: false` so the preview stays available; after the stream ends,
detached outcome finalization marks them `completed`/`aborted`. Esc while a task is active aborts the
subagent first: `runSubagent` sets `aborted: true` and appends `[Task cancelled by user.]` into the
task `summary` (parent model + UI), even when the stream ends without throwing.
so `getActiveSubagents()` (and the Ctrl+T list) only shows truly active tasks.
Task spawn ids are always auto-generated via `generateId("subagent", { exists })` — the model
does not supply an `id` input.
The default task tool row shows the current subagent exploration tool during analysis.
After the subagent calls `begin_summary`, the UI switches to summary phase and streams final text
via `SummaryStreamHub` (`reset` / `append` / `end` on key `task:${toolCallId}`) into `useSummaryStream` /
`SummaryStreamView` — not UIMessage diffs or `emitStreamingChunk` (those remain for `run_command`).
On restart-style stream recovery (429 / capability sanitize), `AgentUIChannel.resetForStreamRetry()`
keeps the user prompt and clears tools/summary so the task panel does not keep stale state;
terminal non-abort failures still call `failRun()`. Max-tokens continuation does not reset.
Compact summarization uses the same hub with stable key `compact:${parentAgentId}` (one in-flight compact per agent).
Only the last text-only step is returned to the parent as the task `summary`; `toModelOutput` also includes completion status (`reachedLimit` / `incomplete` / `aborted` / `truncated`) so the parent can judge whether findings are trustworthy to extend.

### Per-task phase machine & parallel pre-fork

Each `task` tool call owns a one-way phase state machine (`TaskRunState` in `subagent/task-run-state.ts`):
`running` (subagent exploring — its running/thinking/responding statuses fold into this single phase)
→ `summary` (the subagent called `begin_summary`, OR the iteration-limit progress-summary fallback started
its report). Phases are authoritative — never inferred from messages. Registered per parent via `WeakMap`,
keyed by `parentTaskToolCallId`; `readTaskRunPhase` defaults to `running` for unknown tasks.

Parallelism: `subagent/task-prefork.ts` pre-forks subagents eagerly — once all tool args finish streaming
(`TOOL_CALL_END`), each `task` call starts its subagent immediately, so N parallel tasks in one turn run
concurrently (wall-clock ≈ the slowest one). Scheduling is a rolling FIFO window capped at
`MAX_ACTIVE_TASK_PREFORKS = 4`; extra runs queue until a slot frees instead of running serially. The task
loop's own `execute` just joins the already-running promise.

When a subagent hits its iteration limit before `begin_summary`, the **progress-summary fallback**
(`subagent/progress-summary.ts`) spawns a side-LLM summarizer (parent-spawned, no tools) that turns the
partial exploration into a report streamed through the same `SummaryStreamHub`, so the task UI always
shows a readable outcome instead of a bare cutoff. Subagent LLM retries (429/gateway backoff, capability
strip) are surfaced in the task UI via `AgentRetryState` on the session `state` channel, mirroring the
main-chat footer.


```typescript
{
  tool: "task",
  input: {
    prompt: "Find what testing framework this project uses",
    description: "find-test-framework"
  }
}
```

### Architecture

```
packages/core/src/agent/
├── run/
│   └── run-agent-skeleton.ts  # runAgentOnce / consumeAgentStream / ensureUIChannel
├── subagent/
│   ├── run-subagent.ts        # Worker profile: runSubagent(), getSubagent(), destroySubagent()
│   ├── run-stats.ts           # Iteration/limit stats from UI messages + stream
│   ├── subagent-tools.ts      # Read-only tool set for subagents
│   ├── subagent-output.ts     # Cancel notice + summary truncation
│   ├── explore-prompt.ts      # Explore system prompt
│   ├── begin-summary-tool.ts  # begin_summary marker tool
│   ├── progress-summary.ts    # Iteration-limit progress-summary fallback (side-LLM)
│   ├── task-prefork.ts        # Eager parallel pre-fork (rolling window, MAX_ACTIVE_TASK_PREFORKS=4)
│   ├── task-run-state.ts      # Per-task phase machine (running → summary)
│   ├── task-tool.ts           # createTaskTool() for parent agents
│   └── index.ts
├── tools/              # Universal tools (fs/shell/web) + runtime glue
```

## Built-in LSP Extension

CLI local mode enables the built-in LSP extension when `ManagedAgentConfig.lsp !== false` (`createLspExtension()` in `agent-factory.ts`). Requires `@my-agent/node` (`CoreEnv.createLspConnection`); remote/extension hosts degrade gracefully.

| Tool | Purpose |
|------|---------|
| `lsp_diagnostics` / `lsp_hover` / `lsp_definition` / `lsp_references` / `lsp_symbols` / `lsp_completions` | Standard LSP queries (always registered) |
| `lsp_rename` / `lsp_code_actions` | LSP queries skipped by default (`DEFAULT_DISABLED_LSP_TOOLS`) to save per-turn context — re-enable via `lsp: { enableAll: true }` or omit them from `disabledTools` |
| `ast_search` / `code_rewrite` / `code_overview` | Structural tree-sitter tools skipped by default — re-enable via `lsp: { enableAll: true }`. `ast_search`/`code_rewrite` are structure search/rewrite (no LSP equivalent); `code_overview` overlaps `lsp_symbols` |

**Config:** workspace `.lsp.json` (`autoStart`, `servers`, `lombokJar`, `autoInjectDiagnostics`). Commands: `/lsp`, `/lsp-restart`, `/lsp-config`.

#### Per-tool toggle — `ManagedAgentConfig.lsp`

`lsp` accepts `boolean` (existing) or an object: `{ disabledTools?: string[], enableAll?: boolean }`.
- Default: low-usage tools are skipped (`DEFAULT_DISABLED_LSP_TOOLS`: `lsp_rename`, `lsp_code_actions`, `ast_search`, `code_rewrite`, `code_overview`).
- `enableAll: true` re-enables every tool.
- `disabledTools` replaces the default set (no merge). Example: `lsp: { disabledTools: [] }` registers everything; `lsp: { disabledTools: ["lsp_hover"] }` disables hover only.

#### `.lsp.json` — LSP server configuration

Workspace-root `.lsp.json` customizes which language servers run and how. All fields are optional.

```jsonc
{
  "autoStart": ["typescript", "python"],     // languages starting immediately on session open
  "servers": {                                 // keyed by language ID (see EXT_TO_LANGUAGE in lsp/language-map.ts)
    "python": { "command": "basedpyright-langserver", "args": ["--stdio"] },
    "php":   { "command": "phpactor", "args": ["language-server"] }
  },
  "lombokJar": "auto",                         // "auto" = env LOMBOK_JAR + auto-detect
  "autoInjectDiagnostics": true                 // inject diagnostics into write/edit results: true | false | [langIDs]
}
```

**Server entry fields** (`LspServerConfigRecord`): `command` (required), `args` (string[], default `[]`), `env` (extra env vars), `initializationOptions` (LSP `initialize` handshake options), `settings` (returned for `workspace/configuration` requests, keyed by section).

**Built-in defaults** (`DEFAULT_SERVERS` in `lsp-manager.ts`): typescript/javascript/react via `typescript-language-server`, rust via `rust-analyzer`, python via `pyright-langserver`, go via `gopls`, java via `jdtls` (+Lombok), plus clangd (c/cpp), bash-language-server, vscode-{json,css,html}-languageserver, omnisharp (csharp), lua-language-server, phpactor, solargraph (ruby), elixir-ls, sourcekit-lsp (swift). On Node hosts the LSP extension **probes each server binary on PATH before spawning** (`CoreEnv.commandExists`) and skips missing ones with a clear hint — so listing extra defaults is harmless when the tool isn't installed.

**`/lsp` status legend:** 🟢 running · ⚪ configured but idle · 🔴 configured but command not found · 🔵 language mapped in `EXT_TO_LANGUAGE` but no server configured (add one to `.lsp.json` `servers` to enable).

**Parity notes (vs pi-lsp-extension):** Java jdtls gets Lombok via `findLombokJar()` (`LOMBOK_JAR`, explicit path, or `env/Lombok-*` auto-detect). `lsp_symbols` and `lsp_definition` fall back to `WorkspaceIndex` / `findDefinition`. `lsp_completions` supports synthetic-dot member completion with `FileSync` version coordination. Auto-injected write/edit diagnostics poll after file-sync (`tool:after:*` interceptors parse JSON-string args and set `modifiedResult` for the extensions middleware). LSP tool results use plain-text `toModelOutput` (`output.text`).

Validate: `pnpm --filter @my-agent/core run validate:lsp-parity` and `validate:lsp-interceptor`.

## Built-in Code Mode Extension

Sandboxed TypeScript execution via TanStack [`ai-code-mode`](https://tanstack.com/ai) — lets the model write and run TypeScript inside a secure isolated V8 context instead of only issuing read-only tool calls.

Enabled when `ManagedAgentConfig.codeMode !== false` (`createCodeModeExtension()` in `agent-factory.ts`). The extension **feature-detects** the optional CoreEnv capability `createIsolateDriver()`: if the host provides one, code mode is wired up; otherwise it warns and registers nothing (graceful degrade, no native deps in `@my-agent/core`). The Node host implements it via `@tanstack/ai-isolate-node` (backed by `isolated-vm`); browser/WebContainer hosts omit it and code mode stays off.

| Tool | Purpose |
|------|---------|
| `execute_typescript` | Run model-written TypeScript in a secure V8 isolate, with a curated subset of agent tools exposed as `external_*` functions inside the sandbox |
| `discover_tools` | Companion tool registered only when at least one external tool is marked `lazy` — lets the model discover lazy tools on demand |

**Tool subset (kept deliberately small):** only a curated set is exposed to the sandbox as `external_*` bindings — read-only fs tools eager (`read_file`/`grep`/`glob`/`list_file`/`tree`), shell (`run_command`) + `websearch` lazy. Interactive / stateful tools (`ask_user`, `task`, `todo`, plan tools) are excluded. Lazy tools stay out of the system prompt's full type stubs and are listed in a discoverable catalog instead (`discover_tools`), keeping the per-turn prompt small (progressive disclosure).

**Per-turn system prompt:** the extension injects code-mode guidance through a `before_agent_start` interceptor (`event.appendSystemPrompt`) documenting the sandbox API + `external_*` bindings.

**Config:** `ManagedAgentConfig.codeMode` accepts `boolean` (default `true`) or `{ timeout?, memoryLimit?, lazyToolsConfig? }`. The isolate backend must be a CoreEnv optional capability: `createIsolateDriver?(): Promise<IsolateDriver | null> | IsolateDriver | null` (`IsolateDriver` from `@tanstack/ai-code-mode`, type-only — zero native deps in core). Module map: `packages/core/src/agent/code-mode/` (`extension.ts`, `index.ts`); Node host: `packages/node/src/environment/isolate-driver.ts` (lazy-loads `ai-isolate-node`, returns `null` on failure).

Validate: `pnpm --filter @my-agent/core run validate:code-mode-extension` and `pnpm --filter @my-agent/node run validate:code-mode-assembly`.

## Skill System

Skills provide on-demand domain knowledge via progressive disclosure — only the skill
**index** (name + description) is always visible; full instructions load on demand.

| Layer | Mechanism | Tokens |
|-------|-----------|--------|
| Index | `<skills>` injected into per-turn `<extension_context>` by `my-agent-skills` | ~100/skill |
| Discovery | `list_skills` tool | ~100/skill |
| Content | `load_skill` tool for full SKILL.md | ~2000+/skill |

Skills are defined in `SKILL.md` files with YAML frontmatter (name + description required).
The built-in **`my-agent-skills` extension** (`config.skills`, default on) registers the
`list_skills`/`load_skill` tools and injects the available-skills index into each turn's
`<extension_context>` — it no longer lives in the frozen system prompt.

**Config:** `ManagedAgentConfig.skills` accepts `boolean` (default `true`) or
`{ toolsDisabled?, indexDisabled? }`. `skillDirs` adds scan directories (defaults to
`AGENT_SKILL_DIRS`, `~/.agents/skills`, `.agents/skills`) — e.g. add `.cursor/skills` or
`.opencode/skills` to reuse skills written for other harnesses. Module map:
`packages/core/src/agent/skills/` (`extension.ts`, `skill-loader.ts`, `skill-registry.ts`, `index.ts`).
Validate: `pnpm --filter @my-agent/core run validate:skills-extension`.

## Context Compaction System

Three-layer context compaction (plus reactive compaction) for infinite agent sessions:

| Layer | Name | Trigger | Action |
|-------|------|---------|--------|
| Layer 1 | `tool_compact` | Every LLM call | `toModelOutput` transforms (cached per toolCallId) |
| Layer 2 | `reasoning_stripping` | Every LLM call (DeepSeek models) | Strip reasoning content from history to optimize prefix cache |
| Layer 3 | `auto_compact` | Token threshold exceeded | LLM summarization |
| Reactive | `reactive_compact` | `prompt_too_long` API error | Emergency compaction, then retry |

**Configuration:** `compaction` option on `createManagedAgent`:
```typescript
compaction: {
  tokenThreshold: 100000,   // legacy absolute trigger (fallback when model window unknown)
  keepRecentFlows: 2,       // legacy keep policy (fallback when model window unknown)
  // keepRecentTokens: 24000,  // explicit kept-window token budget (optional)
  // reserveTokens: 16384,     // headroom for summary + next turn (kept-window derivation)
}
```

**Keep policy — token budget first:** The kept window is decided by `resolveKeepPolicy()` (`keep-policy.ts`): explicit `keepRecentTokens` > derived from the model context window (`min((window - reserveTokens) * 0.25, 32k)`) > legacy `keepRecentFlows` turn counting when no window is known. Compact-time and wire-projection-time always share the same resolved policy.

**Auto-compact trigger:** The trigger base is the **working budget** — `tokenThreshold`, the same number the UI percentage uses. The agent factory auto-fills it as `min(contextWindow, MAX_THRESHOLD=200k)` when unset, so a huge models.dev window (e.g. 1M) never defers compaction past the displayed budget; the threshold is clamped to the real window so an oversized config cannot defer past what the model accepts (`shouldTriggerAutoCompact`, `resolveAutoCompactTrigger`). Trigger point = `min(tokenThreshold, contextWindow) * compactAtPercent / 100`.

**Auto-compact cut-point strategy:** With a token-budget policy, `findCutPointByBudget()` walks backward accumulating estimated tokens until the budget is reached and cuts at the nearest pairing-safe boundary (user/assistant only — never on a tool result, so call/result pairs stay intact). If the cut lands inside a turn (**split turn**), the discarded turn prefix is summarized separately under `<turn_prefix>` and merged into the SUMMARY; the suffix stays intact. Legacy `findCutPoint()` counts recent *user turns* from the end and keeps the latest N (default: 2 via `keepRecentFlows`). Both skip in-chain summaries and synthetic `<ctx kind=...>` messages. Everything before the cut is summarized; the kept portion remains in the main agent context.

**Summarizer input:** The summarization subagent receives labeled segments — `<to_compress>` (pre-cut history), `<turn_prefix>` (split-turn prefix, dedicated prompt), and `<still_in_context>` (kept turns) — plus optional `<previous-summary>` for incremental updates. Prompt rules tell the model to summarize the compressed segment thoroughly and use the kept segment only to align Goal/Next (no detailed restatement).

**Post-compact (same request):** Append `[CONVERSATION SUMMARY]` onto the UI channel (chronological SoT). Compaction middleware then projects summary-first wire from the **live channel** and never writes the projection back. Auto-compact does not run again until a new durable message lands after that SUMMARY (window reset would otherwise re-trigger via `estimateTokens`). Recovery (`prompt_too_long` / retries) re-reads `managed.ui.getMessages()` live so mid-run appends are visible.

**Transcript archive:** On successful auto, manual (`/compact`), or reactive compaction, the compressed slice is written as greppable markdown under `.agents/transcripts/<sessionId>/compact-<n>.md` (gitignored via `.agents`). The summary gets a runtime-managed `## Compact archives` list (merged across successive compactions). Search **newest → oldest** (`compact-N` first for recent details); prefer grep / small reads — not whole files. Prior archive sections are stripped before `<previous-summary>` so the summarizer does not restate path lists. Archive I/O failures are non-fatal; prior paths are still re-attached when known.

> Module map: `packages/core/src/agent/compaction/` — `tool-compact/` (Layer 1 transforms), `auto-compact.ts` (Layer 3), `keep-policy.ts` (`resolveKeepPolicy`), `cut-point.ts` (`findCutPoint` / `findCutPointByBudget`), `reactive-compact.ts`, `apply-compaction-result.ts`, `compaction-summary.ts`, `message-chain-projection.ts` (`getModelVisibleMessages`), `compaction-prompt.ts`, `write-compact-archive.ts`, `serialize-conversation.ts`, `token-estimator.ts`, `index.ts`.

**Reasoning stripping (Layer 2)** is disabled in `compaction-middleware.ts` because DeepSeek thinking mode requires `reasoning_content` echo-back. DeepSeek endpoints use `ReasoningChatCompletionsTextAdapter`, which maps stream `reasoning_content` into `thinking` and writes it back on subsequent requests.

**Reactive compaction** runs via `runStreamWithRecovery` (`managers/run-stream-recovery.ts`) — on `prompt_too_long` errors, `ManagedAgent.handleReactiveCompact()` appends a SUMMARY onto the live UI channel and retries (skipped for subagents). The retained tail is selected by token budget at a pairing-safe boundary (`selectReactiveTail`), degrading to the latest valid boundary when everything fits the budget — progress is always guaranteed. `getMessages` is a live channel read so the retry does not reuse a pre-run snapshot. The same shell also retries **transient** provider errors (429 / rate-limit / 502–504 / network) with exponential backoff for both main agent and subagents (honors Retry-After when available).

## Workspace `.agents/` layout

Runtime data under the project root is grouped under a single gitignored `.agents/` directory (alongside config such as skills / MCP / extensions):

| Path | Purpose |
|------|---------|
| `.agents/sessions/` | Session JSON (`*.session.json`) |
| `.agents/usage/` | Global usage history (`usage-<year>.jsonl`, per-LLM-call records) |
| `.agents/memory/` | Cross-session memory markdown + `MEMORY.md` |
| `.agents/cache/tool-output/` | Large tool-output spill files |
| `.agents/cache/models-dev.json` | models.dev metadata disk cache |
| `.agents/transcripts/<sessionId>/` | Compaction transcript archives |
| `.agents/plans/` | Saved plan markdown |
| `.agents/skills/` | Project skills |
| `.agents/extension/` | Project extensions |
| `.agents/mcp.json` | Project MCP config |

## Sandbox Environment Configuration

Configure via `SANDBOX_ENV` environment variable or programmatically.

| Value | Description |
|-------|-------------|
| `local` | (default) Real bash + OS sandbox via `@anthropic-ai/sandbox-runtime` |
| `native` | Real bash and Node.js fs, no OS sandbox |

Programmatic equivalent: `createNodeEnv({ rootPath, mode: "os" | "native" })`. Env var: `SANDBOX_ENV=local` in `.env` (see README).

## Tool Output Truncation

### grep Tool
- Max 500 chars per matching line content
- Max 50KB total content across all matches

### read_file Tool

| Type | Extensions | Behavior |
|------|------------|----------|
| Text | `.ts`, `.js`, `.py`, `.md`, etc. | Line-numbered content, offset/limit pagination |
| Directory | (path to directory) | List of entries |
| Image | `.png`, `.jpg`, `.gif`, `.webp` (not SVG) | Vision part for the model; budget uses vision-token estimate (dimensions / size), not base64-as-text |
| PDF | `.pdf` | Extracted text in the tool text part (Completions-safe) + `document` part for Anthropic-style providers |
| Binary | `.mp3`, `.zip`, `.exe`, etc. | Error (cannot read) |

**Text limits:** 2000 lines default, max 100KB, max 2000 chars/line.

**Chat Completions note:** Multimodal tool images are lifted to a synthetic user `image_url` message (`liftToolMediaForChatCompletions`). PDF binaries are not liftable on Completions — rely on extracted text.

### run_command Tool
- Max 50KB for stdout and stderr each
- Keeps the **end** of output (most relevant for errors)

### Streaming UI (`@my-agent/app`)
- **`run_command`:** Core emits every chunk via `emitStreamingChunk` onto the session `tool` channel
  (`chunk` / `clear` by `toolCallId`); throttling is applied in the app layer.
  `useStreamingOutput(toolCallId, { throttleMs })` / `StreamingOutputView` (default `0` = every chunk).
  `ToolCallPartView` defaults `run_command` to 100ms; pass `streamingThrottleMs` to override.
- **Task / compact summary:** Core `SummaryStreamHub` multicasts `reset` / `append` / `end` on the session
  `summary` channel. Task keys are `task:${toolCallId}`; compact keys are stable `compact:${agentId}`
  (single-flight per agent). App `useSummaryStream` / `useActiveCompactSummaryStream` keep a fixed line window
  (`pendingLine` + overflow indicator). Do not route summary text through `StreamingOutputView`.

## CLI Keyboard Shortcuts

| Key | When Running | When Idle | When Approval Pending |
|-----|--------------|-----------|----------------------|
| `Esc` | Aborts current agent run (clears queued messages) | - | Cancel deny-reason input |
| `Ctrl+C` | Exits the app | Exits the app | Exits the app |
| `Ctrl+U` | Clear input | Clear input | - |
| `Ctrl+A` | Select all | Select all | - |
| `Ctrl+V` | Paste image | Paste image | - |
| `Ctrl+E` | - | Toggle workspace browser | - |
| `Ctrl+T` | - | Task / subagent panel | - |
| `Ctrl+Y` | - | Extensions panel | - |
| `Shift+Tab` | - | Cycle mode (normal → auto → plan) | - |
| `y` | - | - | Approve (when input empty) |
| `n` | - | - | Enter deny-reason mode |
| `↑/↓` | - | Navigate history / autocomplete | Navigate autocomplete |
| `Enter` | Queue follow-up (delivered when the agent would stop) | Submit input | Submit deny reason |
| `Option`/`Ctrl+Enter` (macOS) or `Shift+Enter` | Force-submit (abort current run, start new turn) | Insert newline (`Shift+Enter`) | - |
| `/...` | - | Slash commands | Slash commands |

Note: In the TUI, modifier chords use **Ctrl** (not Cmd/⌘). On macOS, prefer `Option+Enter` or `Ctrl+Enter` for force-submit / newline — plain `Shift+Enter` often cannot be distinguished from Enter. Shortcut labels are centralized in `packages/app/src/utils/keyboard-labels.ts`.

## File Structure

```
packages/
├── core/src/                          # @my-agent/core — runtime-agnostic core
│   ├── env.ts                         # CoreEnv interface, registry (registerCoreEnv/getEnv/clearCoreEnv)
│   ├── env-types.ts                   # FileError / ExecutionError / fs+command result types
│   ├── agent/
│   │   ├── agent-log/                 # AgentLog — structured logging
│   │   ├── approval/                  # Auto-mode controller + tool-approval table
│   │   ├── compaction/                # Append SUMMARY + summary-first wire projection
│   │   ├── extension/                 # Extension API (loader, runner, EventBus interception)
│   │   ├── lsp/                       # Built-in LSP extension (extension.ts) + LSP/tree-sitter tools
│   │   ├── mcp/                       # MCP integration
│   │   ├── media/                     # Multimodal media store (media:// refs) + repair helpers
│   │   ├── memory/                    # Memory management + built-in Memory extension
│   │   ├── plan/                      # Plan domain + plan tool factories
│   │   ├── persistence/               # Disk session persistence (SessionStore)
│   │   ├── run-helpers/               # Chat/run helpers (tool-phase, empty-stream, pending queue)
│   │   ├── run/                       # runAgentOnce / consumeAgentStream (run skeleton)
│   │   ├── runner/                    # AgentRunner + run context
│   │   ├── skills/                    # Skill loading + built-in Skills extension
│   │   ├── stream/                    # Stream helpers (errors, assistant-text extract)
│   │   ├── subagent/                  # Subagent spawning + task tool (+ prefork / phase state)
│   │   ├── summary-stream/            # SummaryStreamHub (task / compact summary streams)
│   │   ├── todo-manager/              # Todo tracking + todo tool
│   │   ├── tools/                     # Universal AI tools (fs, shell, web) + runtime/util
│   │   ├── turn-context/              # Per-turn dynamic context (<ctx kind=...> payload)
│   │   ├── ui-channel.ts              # AgentUIChannel (chat / subagent preview)
│   │   ├── default-prompt.ts          # System prompt builder
│   │   └── agent-doc-loader.ts        # Agent documentation loader
│   ├── agent-session/                 # Host-facing AgentSession / Host API
│   ├── managers/                      # AgentManager, ManagedAgent, middleware, run pipeline
│   ├── models/                        # Model config (model-config.ts), adapters, models.dev lookup
│   ├── runtime-types/                 # Shared status / event / usage types (no manager deps)
│   ├── utils/                         # Cross-cutting helpers (Emitter, generateId)
│   ├── index.ts                       # Curated public API exports (hosts / adapters)
│   └── dev*.ts                        # Internal-only re-exports for `pnpm validate:*` scripts
│
├── app/src/                           # @my-agent/app — shared UI layer
│   ├── adapter/
│   │   ├── types.ts                   # AgentAdapter, AppConfig, InitResult interfaces
│   │   └── create-agent.ts            # Shared createAgentFromConfig() helper
│   ├── app/                           # Main app components (App.tsx, Agent.tsx)
│   ├── commands/                      # Slash commands (/help, /shortcuts, /mode, /compact, /display, /theme, /clear, etc.)
│   ├── components/                    # React components (UserInput, EditDiff, Help, etc.)
│   ├── context/                       # React contexts (AdapterProvider)
│   ├── hooks/                         # Shared hooks (useAgentChat, useConfig, useAgent, etc.)
│   │   └── keybindings/               # Per-mode keybinding controllers (global/normal/approval/select/freeform/context)
│   ├── layout/                        # Layout components (Header, Footer, Content)
│   ├── messages/                      # Message rendering (ToolCallPartView, TextPartView, etc.)
│   ├── types/                         # Attachment types
│   ├── utils/                         # Format utilities, clipboard, file attachment
│   └── index.ts                       # Public API exports
│
├── cli/src/                           # @my-agent/cli — terminal host (thin shell)
│   ├── index.tsx                      # Entry point: arg parsing, CoreEnv registration, render
│   ├── args.ts                        # CLI argument parser (sync, no CoreEnv dependency)
│   ├── model-env.ts                   # MODEL_* env → ModelInfo (host-owned, not core)
│   └── local-adapter.ts              # LocalAgentAdapter (delegates to createAgentFromConfig)
│
├── node/src/                          # @my-agent/node — Node.js CoreEnv implementation
│   ├── index.ts                       # createNodeEnv() factory
│   └── environment/
│       ├── local.ts                   # LocalEnvironmentConfig, mode resolution
│       ├── native-fs.ts              # Workspace-scoped filesystem (path traversal protection)
│       ├── native-run.ts             # Command execution with streaming
│       ├── os-sandbox.ts             # OS sandbox via @anthropic-ai/sandbox-runtime
│       └── shell.ts                   # Shell/PTY management
│
├── server/src/                        # @my-agent/server — CoreEnv HTTP server + client
│   ├── index.ts                       # Hono server entry point
│   ├── client.ts                      # createRemoteEnv() — RPC client factory (+ createRemoteAgentSessionHost re-export)
│   ├── remote-provider.ts             # createRemoteProvider()
│   ├── remote-session-host.ts         # createRemoteAgentSessionHost() (AgentSessionHost over HTTP)
│   ├── remote-session-client.ts       # RemoteSessionClient (SSE auto-reconnect, remount seeds)
│   └── routes/
│       ├── env.ts                     # /api/env/* (info, vars, destroy)
│       ├── fs.ts                      # /api/fs/* (readFile, stat, writeFile, etc.)
│       ├── command.ts                 # /api/command/* (run, exec)
│       ├── fetch.ts                   # /api/fetch/proxy (HTTP proxy with binary support)
│       ├── mcp.ts                     # /api/mcp/* (stdio process init, message, delete)
│       ├── provider.ts                # /api/provider/* (OpenAI/Anthropic streaming proxy)
│       └── agent-session.ts           # /api/agent/* (catalog, snapshot, command, events, remount seeds)
│
├── extension/                         # @my-agent/extension — Chrome extension host
│   ├── adapters/
│   │   └── extension-adapter.ts      # ExtensionAgentAdapter
│   ├── entrypoints/
│   │   ├── sidepanel/                # Main UI (AgentBootstrap → App)
│   │   ├── popup/                    # Settings popup (model, provider, API key)
│   │   └── background.ts            # Service worker
│   ├── components/
│   │   ├── ConnectionGuard.tsx       # Server health check, reconnect logic
│   │   └── ErrorBoundary.tsx
│   └── hooks/
│       └── useServerConfig.ts        # Persistent config via chrome.storage
│
└── mcp-server/src/                    # @my-agent/mcp-server — MCP tool server
    └── index.ts

playground/                            # @my-agent/playground — WebContainer host (Vite)
```

## Runtime Combinations

| Combination | CoreEnv | Provider | Status |
|------------|---------|----------|--------|
| Local + CLI | `createNodeEnv` | `createDirectModelProvider` | Fully working |
| Remote workspace + remote keys | `createRemoteEnv` | `createRemoteProvider` | Working; command streaming limited |
| Remote workspace + local keys | `createRemoteEnv` | `createDirectModelProvider` | Working (`--remote-env` without `--remote-provider`) |
| Local workspace + remote keys | `createNodeEnv` | `createRemoteProvider` | Working (`--remote-provider` without `--remote-env`) |
| Remote CoreEnv + Extension | `createRemoteEnv` | remote (no local apiKey) or direct | Working; no command streaming, no stdio MCP |
| Playground | WebContainer CoreEnv | direct or remote | Working; web tools need fetch proxy; no stdio MCP |
| Local CoreEnv + Extension | N/A | N/A | Not supported (extension requires a server) |

## Task Completion Checklist

Validate **once at the end of the task** (not after every small edit). Prefer scoped checks:

1. **Format / lint changed files** (avoid full-repo churn on every tweak):
   ```bash
   pnpm exec prettier --write <changed-files...>
   pnpm exec eslint <changed-files...>
   ```
   Use `pnpm format` / `pnpm lint` only when many files changed or Prettier/ESLint config itself changed.

2. **Build affected packages only** (see also `.cursor/rules/010-affected-package-builds.mdc`):
   ```bash
   pnpm build:core          # example: core-only change
   # or: pnpm build:app / build:cli / …
   ```
   Run full `pnpm build` only for shared contracts, lockfile/workspace config, or unclear multi-package impact.

3. **Package validate scripts** when you touched a utility that has one (e.g. `pnpm --filter @my-agent/core run validate:media-store`).

4. **Fix errors before marking the task complete.** Do not loop lint→format→build after each intermediate edit.

## Important Notes

1. **ESM Only** — All packages use ESM. Use `.js` extensions in imports.
2. **Workspace Dependencies** — Use `workspace:*` for cross-package deps.
3. **Build Order** — Core → App → rest (`pnpm build` handles this).
4. **Type Exports** — Use `export type` for type-only exports.
5. **CoreEnv is the single source of truth** — `rootPath` comes only from `getEnv().rootPath`, never from config objects. Tools access all platform APIs via `getEnv()`.
6. **No Test Framework** — Currently no tests configured. Use TypeScript compiler for validation.
7. **Adapter pattern** — Both hosts (CLI, extension) implement `AgentAdapter` and delegate shared init logic to `createAgentFromConfig()` in `@my-agent/app`.
