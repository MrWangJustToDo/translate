import { useCommandOutput } from "../../hooks/use-command-output.js";

import type { Command, CommandContext, CommandResult } from "./types.js";

/** Built-in slash commands (module-load registration). */
const builtinCommands: Command[] = [];

/** Extension slash commands (synced from Session extensions snapshot after bootstrap). */
const extensionCommands = new Map<string, Command>();

export function registerCommand(command: Command): void {
  const index = builtinCommands.findIndex((c) => c.name === command.name);
  if (index >= 0) {
    builtinCommands[index] = command;
    return;
  }
  builtinCommands.push(command);
}

/**
 * Register an extension-provided slash command.
 * Built-in names win — conflicting extension commands are skipped.
 */
export function registerExtensionCommand(command: Command): boolean {
  if (builtinCommands.some((c) => c.name === command.name)) {
    console.warn(`[commands] Extension command "/${command.name}" skipped — conflicts with built-in`);
    return false;
  }
  extensionCommands.set(command.name, command);
  return true;
}

export function clearExtensionCommands(): void {
  extensionCommands.clear();
}

export function getCommand(name: string): Command | undefined {
  return builtinCommands.find((c) => c.name === name) ?? extensionCommands.get(name);
}

export function getAllCommands(): readonly Command[] {
  return [...builtinCommands, ...extensionCommands.values()];
}

function handleResult(result: CommandResult, ctx: CommandContext, commandName: string): void {
  if (!result.ok) {
    ctx.inputActions.setInputFeedback(result.error, "error");
    return;
  }

  if (!result.message) return;

  if (result.message.includes("\n")) {
    useCommandOutput.getActions().show(`/${commandName}`, result.message, result.node);
  } else {
    ctx.inputActions.setInputFeedback(result.message, "success");
  }
}

/**
 * Try to dispatch a slash command from raw input.
 * Returns true if a command was matched and dispatched.
 */
export async function dispatchCommand(input: string, ctx: CommandContext): Promise<boolean> {
  if (!input.startsWith("/")) return false;

  const spaceIndex = input.indexOf(" ");
  const name = spaceIndex === -1 ? input.slice(1) : input.slice(1, spaceIndex);
  const args = spaceIndex === -1 ? "" : input.slice(spaceIndex + 1).trim();

  const command = getCommand(name);
  if (!command) return false;

  const result = await command.execute(args, ctx);
  handleResult(result, ctx, name);

  return true;
}
