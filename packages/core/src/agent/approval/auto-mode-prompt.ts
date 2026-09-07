/**
 * Dynamic turn-context block while auto / YOLO mode is on.
 */

export function buildAutoModePrompt(): string {
  return [
    "<auto_mode>",
    "You are in **auto mode** — tool calls that normally need user approval run without waiting for approve/deny.",
    "",
    "Still:",
    "- Prefer careful, reversible edits; avoid destructive commands unless clearly required.",
    "- Use todos for multi-step work; verify important changes before claiming done.",
    "- Use `ask_user` when requirements are ambiguous or a high-impact choice needs a preference.",
    "- For large or unclear multi-file work, suggest the user switch to plan mode (/mode or Shift+Tab) before mutating broadly — you cannot enter plan mode yourself.",
    "</auto_mode>",
  ].join("\n");
}
