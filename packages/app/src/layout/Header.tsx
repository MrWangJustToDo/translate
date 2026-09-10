import { useEffect, useMemo } from "react";

import { useAgent } from "../hooks/use-agent";
import { useConfig } from "../hooks/use-config";
import { useSize } from "../hooks/use-size.js";
import { useStatic } from "../hooks/use-static";
import { useWorkspaceInfo } from "../hooks/use-workspace-info";

import { WelcomePanel } from "./WelcomePanel.js";

/** Remote planes active for this session (rendered as a badge under the logo title). */
export function remotePlanesFromConfig(remoteEnv?: string, remoteProvider?: string, remoteSession?: string): string[] {
  return [
    ...(remoteEnv ? ["remote-env"] : []),
    ...(remoteProvider ? ["remote-provider"] : []),
    ...(remoteSession ? ["remote-session"] : []),
  ];
}

// ============================================================================
// Header Component
// ============================================================================

/**
 * Side-effect-only renderer: builds the welcome panel and pushes it into Ink's
 * static output so it is written once at the top of the scrollback.
 */
export const Header = () => {
  const screenWidth = useSize((s) => s.state.screenWidth);
  const { git, path: workspacePath } = useWorkspaceInfo((s) => s.workspaceInfo);
  const remoteEnv = useConfig((s) => s.config.remoteEnv);
  const remoteProvider = useConfig((s) => s.config.remoteProvider);
  const remoteSession = useConfig((s) => s.config.remoteSession);
  const sessionCount = Object.keys(useAgent((s) => s.sessions) ?? {}).length;

  const remotePlanes = useMemo(
    () => remotePlanesFromConfig(remoteEnv, remoteProvider, remoteSession),
    [remoteEnv, remoteProvider, remoteSession]
  );

  useEffect(() => {
    if (!workspacePath) return;
    useStatic
      .getActions()
      .setStaticHeader(
        <WelcomePanel
          variant="ready"
          screenWidth={screenWidth}
          git={git || null}
          workspacePath={workspacePath}
          remotePlanes={remotePlanes}
          sessionCount={sessionCount}
        />
      );
  }, [git, workspacePath, screenWidth, remotePlanes, sessionCount]);

  return null;
};
