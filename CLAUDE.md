# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [AGENTS.md](AGENTS.md) for full architecture, code conventions, and detailed guidelines.

## Quick Reference

**Project:** "My Agent" — an AI coding agent built on TanStack AI. pnpm monorepo:

- **`@my-agent/core`** — Runtime-agnostic core: ManagedAgent, AgentSession, tools, models, CoreEnv
- **`@my-agent/app`** — Shared UI: React, hooks, commands. Session-only for agent control
- **`@my-agent/cli`** — Terminal host using @my-react/react-terminal
- **`@my-agent/node`** — Node.js CoreEnv implementation (filesystem, shell, OS sandbox, code-mode `createIsolateDriver` via `isolated-vm`)
- **`@my-agent/server`** — CoreEnv HTTP + provider proxy + Agent Session routes
- **`@my-agent/extension`** — Chrome extension host using WXT (needs a server)
- **`@my-agent/playground`** — In-browser WebContainer host
- **`@my-agent/mcp-server`** — MCP server for external tool integration
- **`@my-agent/im-bridge`** — Generic IM bridge (Telegram adapter); AgentSession client — remote mode (server resolves model) or in-process local mode

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build all (core → app → rest)
pnpm dev                  # Watch mode for all packages
pnpm start:cli            # Run CLI after build
pnpm start:server         # Run CoreEnv HTTP server (default :3100)
pnpm dev:playground       # WebContainer playground (Vite)
pnpm start:im-bridge      # Telegram bridge (REMOTE_SESSION set = remote mode; absent = local mode)
pnpm typecheck            # Type check all packages
pnpm lint                 # ESLint
pnpm format               # Prettier
```

No shared test runner. Use `pnpm typecheck`, package builds, and `validate:*` scripts. See [AGENTS.md](AGENTS.md) Task Completion Checklist.

After completing a task, validate **once** (not after every edit): format/lint **changed files**, then `pnpm build:<affected>` (prefer package builds over full `pnpm build`).

## Key Rules

- **ESM only** — all packages use `"type": "module"`. Use `.js` extensions in local imports.
- **Double quotes**, semicolons required, 2-space indent, 120 char line width
- **Build order**: core → app → cli/node/server/extension/playground (handled by `pnpm build`)
- **Zod v4** for schemas
- **Workspace deps**: use `workspace:*` for cross-package dependencies
- **CoreEnv is the single source of truth** for `rootPath`, platform info, and environment variables

## Architecture Layers

```
Hosts (CLI / Extension / Playground)
  └─ App Layer (@my-agent/app) — Session-only UI, AgentAdapter
      └─ Core Layer (@my-agent/core) — ManagedAgent, AgentSession, CoreEnv
          └─ CoreEnv Adapter (node local | server remote | WebContainer)
```

## Environment Config

`.env` at repo root configures the provider, model, API key, and sandbox type.

```bash
SANDBOX_ENV=local              # local (OS sandbox) | native (no sandbox)
REMOTE_ENV=http://localhost:3100      # remote CoreEnv (`--remote-env`)
REMOTE_PROVIDER=http://localhost:3100 # remote LLM provider (`--remote-provider`); combines freely with REMOTE_ENV
REMOTE_SESSION=http://localhost:3100  # remote Agent Session (`--remote-session`); exclusive on the CLI — cannot combine with REMOTE_ENV/REMOTE_PROVIDER (server may register its own)
```

Workspace runtime data (sessions, memory, cache, plans, transcripts, skills, extensions, MCP) lives under gitignored `.agents/`. See [AGENTS.md](AGENTS.md) for the path layout.
