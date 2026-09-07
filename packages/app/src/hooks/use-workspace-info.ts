import { getEnv } from "@my-agent/core";
import { createState } from "reactivity-store";

import { refreshKeyboardPlatform } from "../utils/keyboard-labels.js";
import { fetchWorkspaceGitInfo } from "../utils/workspace-git-info";

import { useConfig } from "./use-config.js";

import type { WorkspaceGitInfo } from "../utils/workspace-git-info";

type WorkspaceInfo = {
  path: string;
  git?: WorkspaceGitInfo;
};

function shortenPath(rootPath: string): string {
  return rootPath.length > 40 ? `...${rootPath.slice(-37)}` : rootPath;
}

export const useWorkspaceInfo = createState(
  () => ({
    workspaceInfo: {
      path: "",
      git: undefined,
    } as WorkspaceInfo,
  }),
  {
    withActions: (s) => ({
      setWorkspaceInfo: (workspaceInfo: WorkspaceInfo) => {
        s.workspaceInfo = workspaceInfo;
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
  }
);

export const getWorkSpaceInfo = async () => {
  let path = "";
  let git: WorkspaceGitInfo | undefined;

  try {
    const remoteSession = useConfig.getReadonlyState().config.remoteSession?.trim();
    if (remoteSession) {
      // Remote session: the effective workspace is the one the agent actually
      // runs on (the server process CoreEnv — which may itself be a remote env).
      // Ask the server for its rootPath + git rather than the CLI's local env.
      const base = remoteSession.replace(/\/+$/, "");
      const res = await fetch(`${base}/api/env/workspace`);
      if (res.ok) {
        const data = (await res.json()) as { rootPath?: string; git?: WorkspaceGitInfo | null };
        const rootPath = data.rootPath ?? "";
        path = rootPath ? shortenPath(rootPath) : "";
        git = data.git ?? undefined;
      }
    }
    if (!path) {
      const rootPath = getEnv().rootPath;
      path = rootPath ? shortenPath(rootPath) : "";
      git = git ?? ((await fetchWorkspaceGitInfo(rootPath)) || undefined);
    }
    await refreshKeyboardPlatform();
  } catch {
    void 0;
  }

  useWorkspaceInfo.getActions().setWorkspaceInfo({ path, git });
};
