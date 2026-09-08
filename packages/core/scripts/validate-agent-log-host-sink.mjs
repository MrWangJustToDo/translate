/**
 * Validates AgentLog file-sink host wiring:
 * 1. LocalAgentSessionHost.create() attaches the sink at
 *    `.agents/logs/{sessionId}/agent.log` with a stable `ses_` id, backfilling
 *    bootstrap entries (session:start) and persisting runtime entries.
 * 2. AgentManager.spawnSubagent inherits the parent session dir and writes an
 *    independent `{subagentId}.log`.
 *
 * Run: pnpm --filter @my-agent/core run validate:agent-log-host-sink
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AgentManager, createLocalAgentSessionHost, registerCoreEnv } from "../dist/index.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rootPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-log-host-sink-"));

/** Mirrors native-fs: relative paths resolve under rootPath, absolute pass through. */
const toAbs = (p) => (path.isAbsolute(p) ? p : path.join(rootPath, p));

registerCoreEnv({
  rootPath,
  getPlatform: async () => "linux",
  getArch: async () => "x64",
  getEnv: async () => ({}),
  homedir: async () => rootPath,
  fs: {
    readFile: async (p, encoding) => fs.promises.readFile(toAbs(p), encoding),
    writeFile: async (p, content) => fs.promises.writeFile(toAbs(p), content),
    appendFile: async (p, content) => fs.promises.appendFile(toAbs(p), content, "utf8"),
    mkdir: async (p) => fs.promises.mkdir(toAbs(p), { recursive: true }),
    exists: async (p) =>
      fs.promises.access(toAbs(p)).then(
        () => true,
        () => false
      ),
    readdir: async (p) => {
      try {
        const entries = await fs.promises.readdir(toAbs(p), { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
      } catch {
        return [];
      }
    },
    stat: async (p) => {
      const st = await fs.promises.stat(toAbs(p));
      return { isDirectory: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtime };
    },
    remove: async (p) => fs.promises.rm(toAbs(p), { recursive: true, force: true }),
  },
  runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  fetch: async () => new Response(),
});

const manager = new AgentManager();
const host = createLocalAgentSessionHost({ manager });

// ----------------------------------------------------------------------------
// 1. Main agent: stable ses_ id + session-scoped log dir with bootstrap events.
// ----------------------------------------------------------------------------
const result = await host.create({ name: "verify", model: "test-model" });
const managed = manager.getAgent(result.session.getSnapshot().agentId);
assert.ok(managed, "managed agent created");

const sessionId = managed.ensureSessionData()?.id;
assert.ok(sessionId?.startsWith("ses_"), `stable ses_ id, got ${sessionId}`);

managed.getLog()?.info("system", "host-level-entry");
await sleep(450); // default flush interval is 250ms

const logDir = path.join(rootPath, ".agents/logs", sessionId);
const logFile = path.join(logDir, "agent.log");
assert.ok(
  await fs.promises.access(logFile).then(
    () => true,
    () => false
  ),
  `agent.log exists`
);
const content = await fs.promises.readFile(logFile, "utf-8");
assert.ok(content.includes("host-level-entry"), "runtime entry landed on disk");
assert.ok(content.includes("Session started"), "bootstrap entry persisted (sink attached before bootstrap events)");
console.log("main agent OK:", path.relative(rootPath, logDir));

// ----------------------------------------------------------------------------
// 2. Subagent: inherits parent session dir, independent {subagentId}.log.
// ----------------------------------------------------------------------------
const subagent = await manager.spawnSubagent(managed.id, { name: "sub" });
subagent.getLog()?.info("system", "subagent-entry");
await sleep(450);

const subFile = path.join(logDir, `${subagent.id}.log`);
assert.ok(
  await fs.promises.access(subFile).then(
    () => true,
    () => false
  ),
  `subagent file exists`
);
const subContent = await fs.promises.readFile(subFile, "utf-8");
assert.ok(subContent.includes("subagent-entry"), "subagent entry landed in parent session dir");
console.log("subagent OK:", path.relative(rootPath, subFile));

await fs.promises.rm(rootPath, { recursive: true, force: true });
console.log("agent-log-host-sink validation passed");
