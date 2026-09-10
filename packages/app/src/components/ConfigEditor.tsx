import { Box, Text, useInput } from "ink";
import { useState } from "react";

import { useSize } from "../hooks/use-size.js";
import { WelcomePanel, welcomeTierForWidth } from "../layout/WelcomePanel.js";
import { BG, COLORS } from "../theme/colors.js";
import { KeyLabel, listNavHint, newlineEnterLabel } from "../utils/keyboard-labels.js";

import { FullBox } from "./FullBox.js";
import { Spinner } from "./Spinner.js";
import { TextInput } from "./TextInput.js";

import type { ModelsConfig } from "@my-agent/core";

// ============================================================================
// ConfigEditor — first-run model configuration editor
//
// Shared by all hosts (CLI etc.). A multi-step form that builds a minimal
// `models.json` with a single `direct` entry. The write/parse functions are
// injected so the app package stays decoupled from the concrete persistence
// implementation (core is a peer dependency); the CLI supplies core's
// parseModelsConfig / saveModelsConfig. After completion the config is written
// and the rest of startup reads it back through the same unified pipeline.
// ============================================================================

type StyleChoice = "openai" | "anthropic";

export const STYLE_OPTIONS: readonly StyleChoice[] = ["openai", "anthropic"];

type Step = "style" | "baseURL" | "apiKey" | "models" | "confirm";

/** Ordered steps — drives the `Step N/M` progress indicator. */
const STEP_ORDER: readonly Step[] = ["style", "baseURL", "apiKey", "models", "confirm"];

export interface ConfigEditorProps {
  onDone: (config: ModelsConfig) => void;
  onCancel: () => void;
  /**
   * Persist a validated config to the file source. Injected by the host so the
   * app package does not depend on a specific storage implementation.
   */
  saveModelsConfig: (config: ModelsConfig) => Promise<void>;
  /** Validate + normalize a draft into a ModelsConfig, or null when invalid. */
  parseModelsConfig: (raw: string) => ModelsConfig;
}

interface Draft {
  style: StyleChoice;
  baseURL: string;
  apiKey: string;
  modelsCsv: string;
}

const DEFAULT_DRAFT: Draft = {
  style: "openai",
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  modelsCsv: "",
};

function styleLabel(style: StyleChoice): string {
  return style === "openai" ? "openai" : "anthropic";
}

function parseDraft(draft: Draft, parse: ConfigEditorProps["parseModelsConfig"]): ModelsConfig | null {
  const models = draft.modelsCsv
    .split(/[,\n]/)
    .map((m) => m.trim())
    .filter(Boolean);
  if (models.length === 0) return null;
  if (!draft.baseURL.trim()) return null;
  try {
    return parse(
      JSON.stringify({
        models: [
          {
            type: "direct",
            style: draft.style,
            baseURL: draft.baseURL.trim(),
            ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
            models,
          },
        ],
      })
    );
  } catch {
    return null;
  }
}

/** Confirm-step summary row — fixed-width label column, matching Help's layout. */
const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Box width={10}>
      <Text color={COLORS.muted} dimColor>
        {label}
      </Text>
    </Box>
    <Text color={COLORS.text}>{value}</Text>
  </Box>
);

export const ConfigEditor = ({ onDone, onCancel, saveModelsConfig, parseModelsConfig }: ConfigEditorProps) => {
  const [step, setStep] = useState<Step>("style");
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [styleIndex, setStyleIndex] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // The editor renders before `Agent` (which normally initializes terminal
  // size), so seed the shared size store here too.
  useSize.getActions().useInitTerminalSize();
  const screenWidth = useSize((s) => s.state.screenWidth);
  const tier = welcomeTierForWidth(screenWidth);
  const paddingX = tier === "narrow" ? 1 : 3;
  const innerWidth = Math.max(0, screenWidth - paddingX * 2);
  // Chrome (title + hints) collapses earlier than the logo so rows never crowd.
  const compactChrome = screenWidth < 72;

  function commitText(): void {
    if (step === "baseURL") {
      setDraft((d) => ({ ...d, baseURL: text }));
      setText(draft.apiKey);
      setStep("apiKey");
      setError("");
    } else if (step === "apiKey") {
      setDraft((d) => ({ ...d, apiKey: text }));
      setText(draft.modelsCsv);
      setStep("models");
      setError("");
    } else if (step === "models") {
      setDraft((d) => ({ ...d, modelsCsv: text }));
      const config = parseDraft({ ...draft, modelsCsv: text }, parseModelsConfig);
      if (!config) {
        setError("Provide at least one model id (one per line).");
        return;
      }
      setStep("confirm");
      setError("");
    }
  }

  useInput((input, key) => {
    if (saving) return;

    if (key.escape) {
      onCancel();
      return;
    }

    if (step === "style") {
      if (key.upArrow) {
        setStyleIndex((i) => Math.max(0, i - 1));
        setError("");
        return;
      }
      if (key.downArrow) {
        setStyleIndex((i) => Math.min(STYLE_OPTIONS.length - 1, i + 1));
        setError("");
        return;
      }
      if (key.return) {
        setDraft((d) => ({ ...d, style: STYLE_OPTIONS[styleIndex] }));
        setStep("baseURL");
        setText(draft.baseURL);
        setError("");
      }
      return;
    }

    if (step === "confirm") {
      if (key.return) {
        void (async () => {
          const config = parseDraft(draft, parseModelsConfig);
          if (!config) return;
          setSaving(true);
          try {
            await saveModelsConfig(config);
            onDone(config);
          } catch (err) {
            setSaving(false);
            setError(err instanceof Error ? err.message : String(err));
          }
        })();
      } else if (input === "e" || input === "E") {
        setStep("baseURL");
        setText(draft.baseURL);
        setError("");
      }
      return;
    }

    // Text input steps (baseURL / apiKey / models) are owned by <TextInput>,
    // which handles cursor navigation + editing. Return here so we don't double
    // handle return/backspace/typing with the focused TextInput.
    return;
  });

  // ============================================================================
  // Step chrome (title, progress, hint)
  // ============================================================================

  const stepNo = STEP_ORDER.indexOf(step) + 1;

  const pageTitle = compactChrome ? "First-Run Setup" : "First-Run Model Configuration";

  const stepTitle =
    step === "style"
      ? "Provider style"
      : step === "baseURL"
        ? compactChrome
          ? "Base URL"
          : `Base URL for the ${styleLabel(draft.style)} API`
        : step === "apiKey"
          ? compactChrome
            ? "API key (optional)"
            : "API key (empty to skip)"
          : step === "models"
            ? "Model ids"
            : "Ready to write config";

  const stepHint =
    step === "style"
      ? compactChrome
        ? `(${KeyLabel.upDown} ${KeyLabel.enter} ${KeyLabel.esc})`
        : listNavHint("accept", "cancel")
      : step === "baseURL" || step === "apiKey"
        ? compactChrome
          ? `(${KeyLabel.enter} · ${KeyLabel.esc})`
          : `(${KeyLabel.enter} to continue, ${KeyLabel.esc} to cancel)`
        : step === "models"
          ? compactChrome
            ? `(${newlineEnterLabel()} · ${KeyLabel.enter} · ${KeyLabel.esc})`
            : `(${newlineEnterLabel()} for newline, ${KeyLabel.enter} to continue, ${KeyLabel.esc} to cancel)`
          : "";

  const modelList = draft.modelsCsv
    .split(/[,\n]/)
    .map((m) => m.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <FullBox flexDirection="column">
      <WelcomePanel variant="config" screenWidth={screenWidth} />

      <Box flexDirection="column" paddingX={paddingX}>
        <Text color={BG.border}>{"─".repeat(innerWidth)}</Text>

        {/* Title + progress */}
        <Box marginTop={1} justifyContent="space-between" width="100%" flexShrink={0}>
          <Box flexShrink={1}>
            <Text bold color={COLORS.primary} wrap="truncate">
              {pageTitle}
            </Text>
          </Box>
          <Text color={COLORS.muted} dimColor>
            Step {stepNo}/{STEP_ORDER.length}
          </Text>
        </Box>

        {/* Step name + hint */}
        <Box justifyContent="space-between" width="100%" flexShrink={0}>
          <Box flexShrink={1}>
            <Text color={COLORS.text} wrap="truncate">
              {stepTitle}
            </Text>
          </Box>
          {stepHint ? (
            <Text color={COLORS.muted} dimColor wrap="truncate">
              {stepHint}
            </Text>
          ) : null}
        </Box>

        {/* Body */}
        {step === "style" && (
          <Box flexDirection="column" marginTop={1}>
            {STYLE_OPTIONS.map((s, i) => {
              const selected = i === styleIndex;
              return (
                <Box key={s} height={1}>
                  <Text color={selected ? COLORS.primary : undefined} bold={selected}>
                    {selected ? "❯ " : "  "}
                    {styleLabel(s)}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}

        {step === "baseURL" && (
          <Box marginTop={1}>
            <TextInput value={text} onChange={setText} onSubmit={commitText} placeholder="https://..." />
          </Box>
        )}

        {step === "apiKey" && (
          <Box marginTop={1}>
            <TextInput value={text} onChange={setText} onSubmit={commitText} placeholder="(none)" mask />
          </Box>
        )}

        {step === "models" && (
          <Box marginTop={1}>
            <TextInput value={text} onChange={setText} onSubmit={commitText} placeholder="gpt-4o" />
          </Box>
        )}

        {step === "confirm" && (
          <>
            <Box flexDirection="column" marginTop={1}>
              <SummaryRow label="style" value={styleLabel(draft.style)} />
              <SummaryRow label="baseURL" value={draft.baseURL.trim() || "(none)"} />
              <SummaryRow label="apiKey" value={draft.apiKey.trim() ? "••••" : "(none)"} />
              <SummaryRow label="models" value={modelList} />
            </Box>

            <Box flexDirection="column" marginTop={1}>
              <Text color={BG.border}>{"─".repeat(innerWidth)}</Text>
              <Box marginTop={1}>
                <Text color={COLORS.primary}>{KeyLabel.enter} to save &amp; start</Text>
                <Text dimColor>
                  {compactChrome ? ` · e edit · ${KeyLabel.esc} cancel` : ` · e to edit · ${KeyLabel.esc} to cancel`}
                </Text>
              </Box>
            </Box>
          </>
        )}

        {saving && (
          <Box marginTop={1}>
            <Spinner text="Saving config…" />
          </Box>
        )}
        {error && (
          <Box marginTop={1}>
            <Text color={COLORS.danger}>✖ {error}</Text>
          </Box>
        )}
      </Box>
    </FullBox>
  );
};
