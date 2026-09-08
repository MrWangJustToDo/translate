import { useTheme } from "../hooks/use-theme.js";
import { useTranscriptDisplay } from "../hooks/use-transcript-display.js";
import { isThemeName, THEME_NAMES } from "../theme/colors.js";

import { registerCommand } from "./utils/registry.js";

import type { TranscriptDisplayMode } from "../hooks/use-transcript-display.js";

const DISPLAY_MODES: readonly TranscriptDisplayMode[] = ["compact", "full"];

registerCommand({
  name: "appearance",
  description: "Set UI appearance — color theme and transcript display density (grouped menu)",
  usage: "/appearance [theme toggle|theme gemini|theme claude|display toggle|display compact|display full]",
  immediate: false,
  getOptions: () => {
    const theme = useTheme.getActions().getTheme();
    const display = useTranscriptDisplay.getActions().getMode();
    return [
      {
        label: "theme toggle",
        value: "theme toggle",
        description: `Switch color theme (current: ${theme})`,
      },
      ...THEME_NAMES.map((name) => ({
        label: `theme ${name}`,
        value: `theme ${name}`,
        description: name === theme ? "current" : `Use ${name} palette`,
      })),
      { separator: true, label: "", value: "" },
      {
        label: "display toggle",
        value: "display toggle",
        description: `Switch density (current: ${display})`,
      },
      ...DISPLAY_MODES.map((mode) => ({
        label: `display ${mode}`,
        value: `display ${mode}`,
        description:
          mode === display
            ? "current"
            : mode === "compact"
              ? "One-line tools; fold consecutive reads/searches"
              : "Full tool rows and outputs",
      })),
    ];
  },
  execute: (args) => {
    const theme = useTheme.getActions();
    const display = useTranscriptDisplay.getActions();

    const usageError = () => ({
      ok: false as const,
      error: `Usage: /appearance theme [toggle|${THEME_NAMES.join("|")}] · display [toggle|${DISPLAY_MODES.join(
        "|"
      )}] — Theme: ${theme.getTheme()} · Display: ${display.getMode()}`,
    });

    const trimmed = args.trim().toLowerCase();
    const [head = "", tail = ""] = trimmed.split(/\s+/);

    if (!head) return usageError();

    if (head === "theme") {
      const rest = tail || "toggle";
      if (rest === "toggle") {
        return { ok: true, message: `Theme: ${theme.toggle()}` };
      }
      if (!isThemeName(rest)) {
        return {
          ok: false,
          error: `Unknown theme "${rest}". Use ${THEME_NAMES.join(" or ")}. Current: ${theme.getTheme()}`,
        };
      }
      theme.setTheme(rest);
      return { ok: true, message: `Theme: ${rest}` };
    }

    // Bare display args (toggle / compact / full) stay accepted for convenience.
    const rest = head === "display" ? tail || "toggle" : head;
    if (rest === "toggle") {
      return { ok: true, message: `Display mode: ${display.toggle()}` };
    }
    if (rest === "compact" || rest === "full") {
      display.setMode(rest);
      const hint =
        rest === "compact"
          ? " (one-line tools; fold consecutive completed tools into activity summaries)"
          : " (full tool rows and outputs)";
      return { ok: true, message: `Display mode: ${rest}${hint}` };
    }

    return usageError();
  },
});
