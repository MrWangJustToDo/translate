import { formatKeyboardShortcutsHelp } from "../utils/keyboard-labels.js";

import { getAllCommands, registerCommand } from "./utils/registry.js";

registerCommand({
  name: "help",
  description: "Show keyboard shortcuts and available commands",
  usage: "/help",
  immediate: true,
  execute: () => {
    const commands = getAllCommands();
    const commandLines = commands.map((c) => `  ${c.usage.padEnd(30)} ${c.description}`);
    return {
      ok: true,
      message: [
        formatKeyboardShortcutsHelp(),
        "",
        "Available commands:",
        ...commandLines,
        "",
        "Tip: /theme, /display, /mode, /resume open option menus after Tab/Enter.",
      ].join("\n"),
    };
  },
});
