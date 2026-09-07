import type { AgentAdapter, CommandResult } from "../../adapter/types.js";
import type { UseAgentChatReturn } from "../../hooks/use-agent-chat.js";
import type { useUserInput } from "../../hooks/use-user-input.js";
import type { AgentSession } from "@my-agent/core";
import type { UIMessage } from "@tanstack/ai";

/**
 * Context passed to every command's execute function.
 */
export interface CommandContext {
  inputActions: ReturnType<typeof useUserInput.getActions>;
  getInputState: () => ReturnType<typeof useUserInput.getReadonlyState>;
  getSession: () => AgentSession | null;
  setMessages?: (messages: UIMessage[]) => void;
  getMessages?: () => UIMessage[];
  saveSessionFromChat?: () => void;
  exit?: () => void;
  adapter?: AgentAdapter;
  addToolApprovalResponse?: UseAgentChatReturn["addToolApprovalResponse"];
}

export type { CommandResult };

export interface CommandOption {
  label: string;
  value: string;
  description?: string;
  freeform?: boolean;
  defaultSelected?: boolean;
  /**
   * Visual divider in the option menu — not selectable, not matched while
   * filtering. Label/value are ignored; AutocompleteList renders a rule line.
   */
  separator?: boolean;
}

export interface Command {
  name: string;
  description: string;
  usage: string;
  execute: (args: string, ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  immediate?: boolean;
  getOptions?: (ctx?: CommandContext) => CommandOption[] | Promise<CommandOption[]>;
  allowCustomInput?: boolean;
  /**
   * Selecting a secondary-menu option fills `/cmd <option> ` into the input
   * (instead of executing immediately), letting the user append text before
   * submitting. Use for commands where an option is a prefix for a larger
   * request (e.g. /skill <name> + follow-up instructions).
   */
  insertOnSelect?: boolean;
}
