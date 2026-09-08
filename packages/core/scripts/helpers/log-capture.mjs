/**
 * Shared harness for log validate scripts: registers a real-fs CoreEnv and
 * returns an AgentLog whose file-sink entries can be read back (the log is
 * persistence-only — there is no in-memory entry buffer to query).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AgentLog, clearCoreEnv, registerCoreEnv } from "../../dist/dev.mjs";

export function createFsEnv(rootPath, { withAppendFile = true } = {}) {
  const fsImpl = {
    readFile: async (p, encoding) => fs.promises.readFile(p, encoding),
    writeFile: async (p, content) => fs.promises.writeFile(p, content),
    mkdir: async (p) => fs.promises.mkdir(p, { recursive: true }),
    exists: async (p) =>
      fs.promises.access(p).then(
        () => true,
        () => false
      ),
    readdir: async (p) => {
      try {
        const entries = await fs.promises.readdir(p, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
      } catch {
        return [];
      }
    },
    stat: async (p) => {
      const st = await fs.promises.stat(p);
      return { isDirectory: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtime };
    },
    remove: async (p) => fs.promises.rm(p, { recursive: true, force: true }),
  };
  if (withAppendFile) {
    fsImpl.appendFile = async (p, content) => fs.promises.appendFile(p, content, "utf8");
  }
  return {
    rootPath,
    getPlatform: async () => "linux",
    getArch: async () => "x64",
    getEnv: async () => ({}),
    homedir: async () => rootPath,
    fs: fsImpl,
    runCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
    exec: async () => ({ stdout: "", stderr: "", code: 0 }),
    fetch: async () => new Response(),
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create an AgentLog attached to a temp-dir JSONL sink.
 * Returns `{ log, rootPath, dir, filePath, detach, readEntries, sleep }` where
 * `readEntries()` flushes, reads the JSONL file and returns parsed LogEntry
 * objects (divider lines skipped).
 */
export async function createLogCapture(prefix = "agent-log-capture") {
  const rootPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  clearCoreEnv();
  registerCoreEnv(createFsEnv(rootPath, { withAppendFile: true }));

  const log = new AgentLog();
  const dir = path.join(rootPath, ".agents/logs/ses_capture");
  const filePath = path.join(dir, "agent.log");
  const detach = log.attachFileSink({ dir, filename: "agent.log", flushIntervalMs: 10 });

  const readEntries = async () => {
    let content = "";
    try {
      content = await fs.promises.readFile(filePath, "utf-8");
    } catch {
      return [];
    }
    return content
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("----------"))
      .map((line) => JSON.parse(line));
  };

  return { log, rootPath, dir, filePath, detach, readEntries, sleep };
}
