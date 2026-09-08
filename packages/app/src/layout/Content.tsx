import { StaticRender } from "ink";
import { memo, type JSX } from "react";

import { useSize } from "../hooks";
import { useDiffRenderer } from "../hooks/use-diff-renderer";
import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";
import { useTheme } from "../hooks/use-theme";
import { useWorkspaceInfo } from "../hooks/use-workspace-info";

export const Content = memo(() => {
  const { head, list, listSet, headerSet, toolCallsSignature } = useStatic((s) => ({
    list: s.list,
    listSet: s.listSet,
    headerSet: s.headerSet,
    head: s.header,
    toolCallsSignature: s.toolCallsSignature,
  }));

  const theme = useTheme((s) => s.theme);

  const hasPath = useWorkspaceInfo((s) => s.workspaceInfo.path);

  const mode = useDiffRenderer((s) => s.mode + s.key);

  const { dynamicList, dynamicKey } = useDynamic((s) => ({ dynamicList: s.list, dynamicKey: s.key }));

  const width = useSize((s) => s.state.screenWidth);

  const typedList = list as JSX.Element[];

  const validList = [head, ...typedList].filter(Boolean);

  if (!hasPath) return null;

  return (
    <>
      <StaticRender
        width={width}
        deps={[width, validList.length, listSet, headerSet, dynamicKey, toolCallsSignature, theme, mode]}
      >
        {() => validList}
      </StaticRender>
      {dynamicList}
    </>
  );
});

Content.displayName = "Content";
