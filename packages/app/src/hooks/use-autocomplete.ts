import { createState } from "reactivity-store";

import { getAllCommands } from "../commands";
import {
  COMMAND_FREEFORM_VALUE,
  typedArgsAfterCommand,
  withFreeformOption,
} from "../commands/utils/command-options.js";

import type { Command, CommandOption } from "../commands";

// ============================================================================
// Types
// ============================================================================

export type AutocompleteMode = "commands" | "options";

export interface AutocompleteSuggestion {
  /** Display label */
  label: string;
  /** Usage or full command string */
  usage: string;
  /** Description */
  description: string;
  /** The underlying command (for commands mode) */
  command?: Command;
  /** The option value (for options mode) */
  optionValue?: string;
  /** Freeform option — execute with typed args */
  freeform?: boolean;
  /** Divider row — rendered as a rule line, skipped by selection */
  separator?: boolean;
}

export interface AutocompleteState {
  /** Current mode */
  mode: AutocompleteMode;
  /** Filtered suggestions */
  suggestions: AutocompleteSuggestion[];
  /** Currently selected index */
  selectedIndex: number;
  /** Whether the suggestion list is visible */
  visible: boolean;
  /** Current command when in options mode */
  currentCommand: Command | null;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: AutocompleteState = {
  mode: "commands",
  suggestions: [],
  selectedIndex: 0,
  visible: false,
  currentCommand: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

function commandToSuggestion(cmd: Command): AutocompleteSuggestion {
  return {
    label: cmd.name,
    usage: cmd.usage,
    description: cmd.description,
    command: cmd,
  };
}

function optionToSuggestion(opt: CommandOption, command: Command): AutocompleteSuggestion {
  return {
    label: opt.label,
    usage: opt.freeform ? `/${command.name} <custom>` : `/${command.name} ${opt.label}`,
    description: opt.description || "",
    optionValue: opt.value,
    freeform: opt.freeform === true,
    separator: opt.separator === true,
  };
}

function normalizeOptions(command: Command, options: CommandOption[]): CommandOption[] {
  const hasFreeform = options.some((o) => o.freeform);
  if (command.allowCustomInput && !hasFreeform) {
    return withFreeformOption(options);
  }
  return options;
}

function filterOptions(options: CommandOption[], optionPrefix: string): CommandOption[] {
  const filtered = options.filter((o) => {
    if (o.separator) return !optionPrefix; // drop dividers while filtering
    if (o.freeform) return true;
    if (!optionPrefix) return true;
    return o.label.toLowerCase().includes(optionPrefix) || o.value.toLowerCase().includes(optionPrefix);
  });
  const presets = filtered.filter((o) => !o.freeform);
  const freeform = filtered.filter((o) => o.freeform);
  return [...presets, ...freeform];
}

function applyOptionsToState(
  state: AutocompleteState,
  command: Command,
  options: CommandOption[],
  optionPrefix: string
): void {
  const normalized = normalizeOptions(command, options);
  const filtered = filterOptions(normalized, optionPrefix);
  state.suggestions = filtered.map((o) => optionToSuggestion(o, command));
  // Auto-select default — prefer option with defaultSelected, then first non-freeform
  const defaultIndex = filtered.findIndex((o) => o.defaultSelected && !o.freeform);
  state.selectedIndex = defaultIndex >= 0 ? defaultIndex : Math.min(0, filtered.length - 1);
  state.visible = filtered.length > 0;
}

// ============================================================================
// State Hook
// ============================================================================

export const useAutocomplete = createState(() => ({ ...initialState }), {
  withActions: (state) => ({
    /**
     * Update suggestions based on current input.
     * Shows suggestions when input starts with "/" and has matching commands.
     */
    update: (input: string) => {
      if (!input.startsWith("/")) {
        state.mode = "commands";
        state.suggestions = [];
        state.selectedIndex = 0;
        state.visible = false;
        state.currentCommand = null;
        return;
      }

      // Extract the command name portion (before first space)
      const spaceIndex = input.indexOf(" ");

      if (spaceIndex !== -1 && state.mode === "options" && state.currentCommand) {
        // In options mode, filter options based on input after command
        const optionPrefix = input
          .slice(spaceIndex + 1)
          .toLowerCase()
          .trim();
        const command = state.currentCommand;

        if (command.getOptions) {
          const options = command.getOptions();
          if (options instanceof Promise) {
            options.then((opts) => {
              if (state.currentCommand !== command) return;
              applyOptionsToState(state, command, opts, optionPrefix);
            });
          } else {
            applyOptionsToState(state, command, options, optionPrefix);
          }
        }
        return;
      }

      if (spaceIndex !== -1) {
        // User typed space but not in options mode - hide suggestions
        state.suggestions = [];
        state.selectedIndex = 0;
        state.visible = false;
        return;
      }

      // Commands mode - filter by prefix
      state.mode = "commands";
      state.currentCommand = null;
      const prefix = input.slice(1).toLowerCase();
      const commands = getAllCommands();
      const filtered = prefix ? commands.filter((c) => c.name.startsWith(prefix)) : [...commands];

      state.suggestions = filtered.map(commandToSuggestion);
      state.selectedIndex = filtered.length > 0 ? Math.min(state.selectedIndex, filtered.length - 1) : 0;
      state.visible = filtered.length > 0;
    },

    /**
     * Select next suggestion (skips separator rows)
     */
    selectNext: () => {
      if (!state.visible || state.suggestions.length === 0) return;
      let next = (state.selectedIndex + 1) % state.suggestions.length;
      while (state.suggestions[next]?.separator && next !== state.selectedIndex) {
        next = (next + 1) % state.suggestions.length;
      }
      state.selectedIndex = next;
    },

    /**
     * Select previous suggestion (skips separator rows)
     */
    selectPrev: () => {
      if (!state.visible || state.suggestions.length === 0) return;
      let prev = (state.selectedIndex - 1 + state.suggestions.length) % state.suggestions.length;
      while (state.suggestions[prev]?.separator && prev !== state.selectedIndex) {
        prev = (prev - 1 + state.suggestions.length) % state.suggestions.length;
      }
      state.selectedIndex = prev;
    },

    /**
     * Accept the currently selected suggestion.
     * Pass `currentInput` so freeform options can use the typed suffix.
     */
    accept: (currentInput?: string): { type: "input" | "execute"; value: string } | null => {
      if (!state.visible || state.suggestions.length === 0) return null;
      const selected = state.suggestions[state.selectedIndex];
      if (!selected) return null;
      // Defensive: separators are skipped by selection; ignore if somehow selected
      if (selected.separator) return null;

      if (state.mode === "options") {
        const command = state.currentCommand;
        state.mode = "commands";
        state.suggestions = [];
        state.selectedIndex = 0;
        state.visible = false;
        state.currentCommand = null;

        if (!command) return null;

        if (selected.freeform || selected.optionValue === COMMAND_FREEFORM_VALUE) {
          const typed = typedArgsAfterCommand(currentInput ?? "", command.name);
          return {
            type: "execute",
            value: typed ? `/${command.name} ${typed}` : `/${command.name}`,
          };
        }

        const value = selected.optionValue ?? selected.label;
        // `insertOnSelect` commands keep the input editable after selecting an
        // option (fill `/cmd <option> `) so the user can append follow-up text
        // before submitting — e.g. /skill <name> + instructions. Other commands
        // (e.g. /resume) execute immediately on selection.
        if (command.insertOnSelect) {
          return {
            type: "input",
            value: `/${command.name} ${value} `,
          };
        }
        return {
          type: "execute",
          value: value ? `/${command.name} ${value}` : `/${command.name}`,
        };
      }

      // Commands mode
      const command = selected.command;
      if (!command) return null;

      // If command is immediate (like /help), execute it directly
      if (command.immediate) {
        state.suggestions = [];
        state.selectedIndex = 0;
        state.visible = false;
        state.currentCommand = null;
        return { type: "execute", value: `/${command.name}` };
      }

      // If command has options, switch to options mode
      if (command.getOptions) {
        state.mode = "options";
        state.currentCommand = command;
        state.selectedIndex = 0;

        const options = command.getOptions();
        if (options instanceof Promise) {
          options.then((opts) => {
            if (state.currentCommand !== command) return;
            applyOptionsToState(state, command, opts, "");
          });
          return { type: "input", value: `/${command.name} ` };
        }
        applyOptionsToState(state, command, options, "");
        return { type: "input", value: `/${command.name} ` };
      }

      // Default: set input to command with trailing space
      state.suggestions = [];
      state.selectedIndex = 0;
      state.visible = false;
      state.currentCommand = null;

      return { type: "input", value: `/${command.name} ` };
    },

    /**
     * Dismiss suggestions
     */
    dismiss: () => {
      state.mode = "commands";
      state.suggestions = [];
      state.selectedIndex = 0;
      state.visible = false;
      state.currentCommand = null;
    },
  }),

  withDeepSelector: false,
  withStableSelector: true,
  withNamespace: "useAutocomplete",
});
