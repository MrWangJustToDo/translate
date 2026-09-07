import { Box, Text } from "ink";
import { StreamMarkdown } from "ink-stream-markdown";
import { useEffect, useState } from "react";
import { toRaw } from "reactivity-store";

import { useAgent } from "../hooks/use-agent.js";
import { usePlanPreview } from "../hooks/use-plan-preview.js";
import { useSize } from "../hooks/use-size.js";
import { COLORS } from "../theme/colors.js";
import { markdownTheme } from "../theme/markdown-theme.js";
import { KeyLabel } from "../utils/keyboard-labels.js";

import type { PlanModeState } from "@my-agent/core";

/**
 * Ready-state banner: Build/revise hints + optional full-plan markdown preview.
 * Toggle preview with {@link KeyLabel.ctrlP} when the chat input is empty (wired in keybindings);
 * with the preview open, Enter builds the approved plan.
 */
export const PlanReadyBanner = () => {
  const session = toRaw(useAgent((s) => s.session));
  const [plan, setPlan] = useState<PlanModeState | null>(() => session?.getSnapshot().plan ?? null);
  const previewOpen = usePlanPreview((s) => s.open);
  const width = useSize((s) => s.state.screenWidth);

  useEffect(() => {
    if (!session) {
      setPlan(null);
      return;
    }
    setPlan(session.getSnapshot().plan);
    return session.subscribe(
      (event) => {
        if (event.channel === "plan") {
          setPlan(event.payload);
        }
      },
      { channels: ["plan"] }
    );
  }, [session]);

  useEffect(() => {
    if (!plan) return;
    if (plan.phase !== "ready" && previewOpen) {
      usePlanPreview.getActions().hide();
    }
  }, [plan, previewOpen]);

  if (!plan || plan.phase !== "ready") return null;

  const steps = plan.steps.length;
  const path = plan.planFilePath ? ` · ${plan.planFilePath}` : "";
  const preserved = plan.preservedExistingTodos ? " · existing todos kept until Build" : "";
  const markdown = plan.planMarkdown?.trim() || "";
  const previewWidth = Math.max(40, width - 4);

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1} gap={1}>
      <Box flexDirection="column">
        <Text color={COLORS.accent} bold>
          Plan ready for review{steps > 0 ? ` (${steps} steps)` : ""}
          {path}
          {preserved}
        </Text>
        <Text color={COLORS.muted} dimColor>
          {KeyLabel.ctrlP} review plan · /mode save · revise in chat · /mode off to exit
          {previewOpen ? ` · ${KeyLabel.enter} build · ${KeyLabel.esc} close preview` : ""}
        </Text>
      </Box>

      {previewOpen && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={COLORS.accent}
          paddingX={1}
          paddingY={0}
          width={previewWidth}
        >
          {markdown ? (
            <StreamMarkdown theme={{ ...markdownTheme, width: previewWidth - 4 }}>{markdown}</StreamMarkdown>
          ) : (
            <Text color={COLORS.muted} dimColor>
              No plan markdown available
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};
