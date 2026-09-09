/**
 * Local AgentSession command dispatch against ManagedAgent.
 */

import type { AgentSessionCommand, AgentSessionCommandResult } from "./types.js";
import type { ManagedAgent } from "../managers/managed-agent.js";

/**
 * Commands allowed on subagent sessions (preview / stop / light housekeeping).
 * Chat send and plan/MCP/extension management stay root-only.
 */
export const SUBAGENT_ALLOWED_COMMANDS = new Set<AgentSessionCommand["type"]>([
  "stop",
  "clear",
  "rename",
  "setClientToolWaiting",
  "respondApproval",
  "addToolResult",
]);

export async function dispatchLocalAgentSessionCommand(
  managed: ManagedAgent,
  _manager: unknown,
  command: AgentSessionCommand
): Promise<AgentSessionCommandResult> {
  const isSubagent = Boolean(managed.parentId);
  if (isSubagent && !SUBAGENT_ALLOWED_COMMANDS.has(command.type)) {
    return {
      ok: false,
      code: "unsupported",
      error: `Command "${command.type}" is not supported on subagent sessions`,
    };
  }

  const chat = managed.getChatController();

  try {
    switch (command.type) {
      case "send": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        await chat.sendMessage(command.content);
        return { ok: true };
      }
      case "steer": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        chat.steer(command.content);
        return { ok: true };
      }
      case "followUp": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        chat.followUp(command.content);
        return { ok: true };
      }
      case "forceSubmit": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        chat.forceSubmit(command.content);
        return { ok: true };
      }
      case "stop": {
        if (chat) {
          chat.stop();
        } else {
          managed.abort("user-cancelled");
        }
        return { ok: true };
      }
      case "clear": {
        // In-place message clear only. Brand-new agent sessions use Host.create.
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        chat.clearMessages();
        return { ok: true };
      }
      case "respondApproval": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        await chat.respondToToolApproval(command.approvalId, command.approved, command.reason);
        return { ok: true };
      }
      case "addToolResult": {
        if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
        await chat.addToolResult(command.toolCallId, command.output);
        return { ok: true };
      }
      case "setClientToolWaiting": {
        managed.setClientToolWaiting(command.active);
        return { ok: true };
      }
      case "compact": {
        const result = await managed.compact({ focus: command.focus });
        return result.ok ? { ok: true, data: result } : { ok: false, code: "failed", error: result.error };
      }
      case "rename": {
        const { applySessionRename } = await import("./session-lifecycle-commands.js");
        const result = await applySessionRename(managed, command.name);
        return result.ok
          ? { ok: true, data: { name: result.name } }
          : { ok: false, code: "failed", error: result.error };
      }
      case "rename.generate": {
        const { generateAndApplySessionTitle } = await import("./session-lifecycle-commands.js");
        const result = await generateAndApplySessionTitle(managed);
        return result.ok
          ? { ok: true, data: { name: result.name } }
          : { ok: false, code: "failed", error: result.error };
      }
      case "mode.set": {
        const mode = managed.setAgentMode(command.mode);
        return { ok: true, data: { mode } };
      }
      case "mode.toggle": {
        const mode = managed.cycleAgentMode();
        return { ok: true, data: { mode } };
      }
      case "plan.execute": {
        const result = managed.beginPlanExecution({ sendSteer: command.sendSteer });
        return result.ok
          ? { ok: true, data: result }
          : { ok: false, code: "failed", error: result.error ?? "plan execute failed" };
      }
      case "plan.cancel": {
        const ok = managed.cancelPlanExecution();
        return ok ? { ok: true } : { ok: false, code: "failed", error: "Cannot cancel plan execution" };
      }
      case "plan.save": {
        const result = await managed.savePlanToWorkspace(command.nameHint);
        return result.ok
          ? { ok: true, data: result }
          : { ok: false, code: "failed", error: result.error ?? "plan save failed" };
      }
      case "plan.load": {
        const result = await managed.loadPlanFromWorkspace(command.name);
        return result.ok
          ? { ok: true, data: result }
          : { ok: false, code: "failed", error: result.error ?? "plan load failed" };
      }
      case "plan.list": {
        const files = await managed.listWorkspacePlans();
        return { ok: true, data: { files } };
      }
      case "plan.complete": {
        const result = managed.completePlan();
        return result.ok ? { ok: true } : { ok: false, code: "failed", error: result.error ?? "Cannot complete plan" };
      }
      case "mcp.refresh": {
        const servers = managed.getMcpManager()?.getServerStatuses() ?? [];
        return { ok: true, data: { servers } };
      }
      case "extension.toggle": {
        const runner = managed.extensionRunner;
        if (!runner) {
          return { ok: false, code: "failed", error: "No extension runner" };
        }
        const result = await runner.setEnabled(command.id, command.enabled);
        return result.ok ? { ok: true, data: result } : { ok: false, code: "failed", error: result.message };
      }
      case "extension.invokeCommand": {
        const cmd = managed.getExtensionCommands().find((c) => c.name === command.name);
        if (!cmd) {
          return { ok: false, code: "not_found", error: `Extension command "/${command.name}" not found` };
        }
        const args = command.args ?? [];
        const message = await cmd.execute(args);
        // Commands may opt into injecting a user message into the session,
        // driving the agent to act on the command (e.g. /skill <name>).
        if (cmd.injectMessage) {
          const inject = await cmd.injectMessage(args, message);
          if (inject && inject.trim().length > 0) {
            if (!chat) return { ok: false, code: "failed", error: "Chat controller not initialized" };
            await chat.sendMessage(inject);
          }
        }
        return { ok: true, data: message ? { message } : undefined };
      }
      case "extension.getCommandOptions": {
        const cmd = managed.getExtensionCommands().find((c) => c.name === command.name);
        if (!cmd) {
          return { ok: false, code: "not_found", error: `Extension command "/${command.name}" not found` };
        }
        const options = cmd.getOptions ? await cmd.getOptions(command.args ?? []) : [];
        return { ok: true, data: { options } };
      }
      case "session.resume": {
        const data = await managed.restoreSession(command.sessionId);
        return {
          ok: true,
          data: {
            sessionId: data.id,
            name: data.name,
            model: data.model,
            uiMessages: data.uiMessages,
          },
        };
      }
      case "session.list": {
        const store = managed.getSessionStore();
        if (!store) {
          return { ok: false, code: "failed", error: "Session store not available" };
        }
        const sessions = await store.list();
        return {
          ok: true,
          data: {
            sessions: sessions.map((s) => ({
              id: s.id,
              name: s.name,
              model: s.model,
              updatedAt: s.updatedAt,
              createdAt: s.createdAt,
            })),
          },
        };
      }
      case "session.new": {
        const { startNewDiskSession } = await import("./session-lifecycle-commands.js");
        const result = await startNewDiskSession(managed);
        return result.ok
          ? { ok: true, data: { sessionId: result.sessionId } }
          : { ok: false, code: "failed", error: result.error };
      }
      case "usage.history": {
        const { getUsageHistory } = await import("../agent/usage/usage-history.js");
        const weeks = Math.min(52, Math.max(1, Math.floor(command.weeks ?? 12)));
        const history = await getUsageHistory(weeks);
        return { ok: true, data: { weeks, ...history } };
      }
      case "effort.set": {
        managed.setReasoningEffort(command.effort);
        return { ok: true, data: { effort: managed.getReasoningEffort() } };
      }
      case "model.set": {
        managed.setModel({
          model: command.model,
          modelStyle: command.modelStyle,
          modelBaseURL: command.modelBaseURL,
          modelApiKey: command.modelApiKey,
          modelInfo: command.modelInfo,
        });
        const { config } = managed;
        return {
          ok: true,
          data: { model: config.model, modelStyle: config.modelStyle, modelBaseURL: config.modelBaseURL },
        };
      }
      default: {
        const _exhaustive: never = command;
        return { ok: false, code: "invalid", error: `Unknown command: ${JSON.stringify(_exhaustive)}` };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "failed", error: message };
  }
}
