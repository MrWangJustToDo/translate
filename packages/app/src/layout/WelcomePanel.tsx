import { Box, Text } from "ink";
import { useMemo } from "react";

import { FullBox } from "../components/FullBox.js";
import { Spinner } from "../components/Spinner.js";
import { BG, COLORS } from "../theme/colors.js";
import { getGradientStops, interpolateColor, mapCharsToGradient } from "../utils/gradient.js";
import { headerShortcutTips } from "../utils/keyboard-labels.js";

import type { WorkspaceGitInfo } from "../utils/workspace-git-info.js";

// ============================================================================
// Brand mark
// ============================================================================

// prettier-ignore
const LOGO_LINES = [
  " █▀▄▀█ █ █   ▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀",
  " █ ▀ █ ▀▄▀   █▀█ █▄█ ██▄ █ ▀█  █ ",
];

/** Rendered width of the block-letter wordmark (used for tier thresholds). */
const LOGO_WIDTH = LOGO_LINES[0].length;

/** Compact wordmark shown when the block letters would not fit. */
const NARROW_WORDMARK = "MY AGENT";

// ============================================================================
// Responsive tiers
// ============================================================================

export type WelcomeTier = "wide" | "compact" | "narrow";

/** Layout tier for a terminal width: full / trimmed / single-line wordmark. */
export function welcomeTierForWidth(width: number): WelcomeTier {
  if (width >= 80) return "wide";
  if (width >= LOGO_WIDTH + 8) return "compact";
  return "narrow";
}

/** Number of startup tips that fit on one line per tier. */
function tipsForTier(tier: WelcomeTier): ReadonlyArray<{ key: string; desc: string }> {
  const tips = headerShortcutTips();
  if (tier === "wide") return tips;
  if (tier === "compact") return tips.slice(0, 3);
  return tips.slice(0, 1);
}

/** Last path segment, used as a shorter workspace label on compact terminals. */
function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

// ============================================================================
// Gradient wordmark
// ============================================================================

const GradientLine = ({
  text,
  stops,
  rowOffset,
}: {
  text: string;
  stops: string[] | readonly string[];
  rowOffset: number;
}) => {
  const chars = useMemo(() => {
    const totalLen = Math.max(LOGO_WIDTH, 1);
    return [...text].map((ch, i) => ({
      ch,
      color: ch.trim() ? interpolateColor(stops, (i + rowOffset * 0.3) / totalLen) : undefined,
    }));
  }, [text, stops, rowOffset]);

  return (
    <Text>
      {chars.map((c, i) => (
        <Text key={i} color={c.color}>
          {c.ch}
        </Text>
      ))}
    </Text>
  );
};

const Wordmark = ({ tier }: { tier: WelcomeTier }) => {
  const stops = getGradientStops();

  if (tier === "narrow") {
    const chars = mapCharsToGradient(NARROW_WORDMARK, stops);
    return (
      <Text bold>
        {chars.map((c, i) => (
          <Text key={i} color={c.color}>
            {c.ch}
          </Text>
        ))}
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      {LOGO_LINES.map((line, i) => (
        <GradientLine key={i} text={line} stops={stops} rowOffset={i} />
      ))}
    </Box>
  );
};

// ============================================================================
// Meta / tips rows
// ============================================================================

/** Workspace + git line — full detail on wide terminals, trimmed on compact. */
const MetaLine = ({
  tier,
  git,
  workspacePath,
}: {
  tier: WelcomeTier;
  git: WorkspaceGitInfo | null;
  workspacePath: string;
}) => {
  const displayPath = tier === "compact" && workspacePath ? basename(workspacePath) : workspacePath;
  const branch = git ? `${git.branch}${git.dirty ? "*" : ""}` : "";
  const showSha = tier === "wide" && Boolean(git?.shortSha) && git != null && !git.branch.includes(git.shortSha);

  return (
    <Box marginTop={1} justifyContent="center" width="100%" flexShrink={0}>
      <Text wrap="truncate">
        {displayPath ? (
          <Text color={COLORS.muted} dimColor>
            {displayPath}
          </Text>
        ) : null}
        {displayPath && git ? (
          <Text color={COLORS.muted} dimColor>
            {" · "}
          </Text>
        ) : null}
        {git ? (
          <>
            <Text color={COLORS.muted} dimColor>
              git{" "}
            </Text>
            <Text color={COLORS.primary}>{branch}</Text>
            {showSha ? (
              <Text color={COLORS.muted} dimColor>
                {" · "}
                {git.shortSha}
              </Text>
            ) : null}
          </>
        ) : null}
      </Text>
    </Box>
  );
};

const TipsRow = ({ tier, innerWidth }: { tier: WelcomeTier; innerWidth: number }) => {
  const tips = useMemo(() => tipsForTier(tier), [tier]);

  if (tips.length === 0) return null;

  return (
    <Box flexDirection="column" width="100%" flexShrink={0}>
      <Box marginTop={1}>
        <Text color={BG.border}>{"─".repeat(Math.max(0, innerWidth))}</Text>
      </Box>
      <Box marginTop={1} gap={tier === "wide" ? 3 : 2} justifyContent="center" width="100%" flexShrink={0}>
        {tips.map((tip, i) => (
          <Box key={i} gap={1} flexShrink={0}>
            <Text color={COLORS.text}>{tip.key}</Text>
            <Text color={COLORS.muted} dimColor>
              {tip.desc}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// ============================================================================
// WelcomePanel
// ============================================================================

export interface WelcomePanelProps {
  /**
   * `loading` shows a spinner, `ready` shows meta + tips, `error` shows a
   * message, `config` renders only the brand mark (onboarding header).
   */
  variant: "loading" | "ready" | "error" | "config";
  /** Current terminal width — drives the responsive tier. */
  screenWidth: number;
  git?: WorkspaceGitInfo | null;
  workspacePath?: string;
  /** Active remote planes, shown as a badge under the tagline (ready only). */
  remotePlanes?: string[];
  /** Number of open sessions; >1 is shown in the badge (ready only). */
  sessionCount?: number;
  /** Status line for the `loading` variant. */
  loadingText?: string;
  /** Message shown by the `error` variant. */
  errorMessage?: string;
}

/**
 * Shared branded startup block. Used by the initialization/loading screen, the
 * static welcome header, and the first-run config editor so they share one look.
 * The `config` variant renders only the brand mark (no status area).
 */
export const WelcomePanel = ({
  variant,
  screenWidth,
  git = null,
  workspacePath = "",
  remotePlanes = [],
  sessionCount = 1,
  loadingText = "Initializing sandbox…",
  errorMessage,
}: WelcomePanelProps) => {
  const tier = welcomeTierForWidth(screenWidth);
  const paddingX = tier === "narrow" ? 1 : 3;
  const innerWidth = Math.max(0, screenWidth - paddingX * 2);

  const badge = [...remotePlanes, ...(sessionCount > 1 ? [`${sessionCount} sessions`] : [])].join(" · ");

  const showBadge = variant === "ready" && badge.length > 0;
  const showMeta = variant === "ready" && tier !== "narrow" && (Boolean(workspacePath) || git != null);

  return (
    <FullBox flexDirection="column" key="welcome" marginBottom={1} paddingX={paddingX} paddingY={1}>
      {/* Brand mark */}
      <Box flexDirection="column" alignItems="center" width="100%">
        <Wordmark tier={tier} />

        <Box marginTop={1}>
          <Text color={COLORS.accent} italic>
            AI-Powered Coding Agent
          </Text>
        </Box>

        {showBadge && (
          <Box marginTop={1}>
            <Text color={COLORS.warning} dimColor>
              {badge}
            </Text>
          </Box>
        )}
      </Box>

      {/* Status area — the only part that differs between variants */}
      {variant === "loading" && (
        <Box marginTop={1} justifyContent="center" width="100%">
          <Spinner text={loadingText} />
        </Box>
      )}

      {variant === "error" && (
        <Box marginTop={1} flexDirection="column" alignItems="center" width="100%">
          <Text color={COLORS.danger} bold>
            Initialization Error
          </Text>
          {errorMessage ? <Text color={COLORS.danger}>{errorMessage}</Text> : null}
        </Box>
      )}

      {variant === "ready" && (
        <>
          {showMeta && <MetaLine tier={tier} git={git} workspacePath={workspacePath} />}
          <TipsRow tier={tier} innerWidth={innerWidth} />
        </>
      )}
    </FullBox>
  );
};
