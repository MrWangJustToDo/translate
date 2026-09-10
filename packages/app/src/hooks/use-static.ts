import { useStdout } from "ink";
import { type JSX } from "react";
import { createState, markRaw } from "reactivity-store";

export const useStatic = createState(
  () => ({
    stdoutRef: markRaw({ current: null as ReturnType<typeof useStdout>["stdout"] | null }),
    header: null as JSX.Element | null,
    list: [] as JSX.Element[],
    headerSet: 0,
    listSet: 0,
    toolCallsSignature: "",
  }),
  {
    withActions(s) {
      return {
        useInitStdout: () => {
          const result = useStdout();
          s.stdoutRef.current = result.stdout;
        },
        setStaticHeader: (item: JSX.Element) => ((s.header = item), s.headerSet++),
        setStaticList: (items: JSX.Element[]) => ((s.list = items), s.listSet++),
        setToolCallsSignature: (signature: string) => {
          if (s.toolCallsSignature === signature) return;
          s.toolCallsSignature = signature;
        },
      };
    },

    // withNamespace: "useStatic",

    withDeepSelector: false,

    withStableSelector: true,
  }
);

useStatic.getLifeCycle().syncUpdateComponent = true;
