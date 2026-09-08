import { useDiffRenderer } from "../hooks/use-diff-renderer.js";
import { useTheme } from "../hooks/use-theme.js";
import { useTranscriptDisplay } from "../hooks/use-transcript-display.js";
import { isThemeName, THEME_NAMES } from "../theme/colors.js";

import { registerCommand } from "./utils/registry.js";

import type { TranscriptDisplayMode } from "../hooks/use-transcript-display.js";

const DISPLAY_MODES: readonly TranscriptDisplayMode[] = ["compact", "full"];

registerCommand({
  name: "appearance",
  description: "Set UI appearance — color theme and transcript display density (grouped menu)",
  usage: "/appearance [theme ...|display ...|diff ...]",
  immediate: false,
  getOptions: () => {
    const theme = useTheme.getActions().getTheme();
    const display = useTranscriptDisplay.getActions().getMode();
    const diff = useDiffRenderer.getActions().getMode();
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
      { separator: true, label: "", value: "" },
      {
        label: "diff toggle",
        value: "diff toggle",
        description: `Switch diff renderer (current: ${diff})`,
      },
      {
        label: "diff lite",
        value: "diff lite",
        description: diff === "lite" ? "current" : "Hunk-only rows, wraps long lines (gemini-cli style)",
      },
      {
        label: "diff full",
        value: "diff full",
        description: diff === "full" ? "current" : "git-diff-view Split/Unified view (wraps long lines)",
      },
    ];
  },
  execute: (args) => {
    const theme = useTheme.getActions();
    const display = useTranscriptDisplay.getActions();
    const diff = useDiffRenderer.getActions();

    const usageError = () => ({
      ok: false as const,
      error: `Usage: /appearance theme [toggle|${THEME_NAMES.join("|")}] · display [toggle|${DISPLAY_MODES.join(
        "|"
      )}] · diff [toggle|lite|full] — Theme: ${theme.getTheme()} · Display: ${display.getMode()} · Diff: ${diff.getMode()}`,
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

    if (head === "diff") {
      const rest = tail || "toggle";
      if (rest === "toggle") {
        return { ok: true, message: `Diff renderer: ${diff.toggle()}` };
      }
      if (rest === "lite" || rest === "full") {
        diff.setMode(rest);
        return { ok: true, message: `Diff renderer: ${rest}` };
      }
      return usageError();
    }

    // Bare display args (toggle / compact / full) stay accepted — the bare
    // "full" is display density, diff full requires the "diff" prefix.
    // Bare "lite" is accepted for the diff renderer.
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
    if (rest === "lite") {
      diff.setMode(rest);
      return { ok: true, message: `Diff renderer: ${rest}` };
    }

    return usageError();
  },
});
