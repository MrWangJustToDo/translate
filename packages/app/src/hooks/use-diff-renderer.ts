import { createState } from "reactivity-store";

import { USE_LITE_DIFF } from "../utils/diff-renderer-flag.js";

export type DiffRendererMode = "lite" | "full";

/**
 * Runtime diff-renderer selection for the message view (toggled via
 * `/appearance`). `USE_LITE_DIFF` only seeds the initial value — both
 * renderers stay bundled because `EditDiff` is statically imported anyway.
 */
export const useDiffRenderer = createState(
  () => ({
    mode: (USE_LITE_DIFF ? "lite" : "full") as DiffRendererMode,
    key: 0,
  }),
  {
    withActions: (state) => ({
      setMode: (mode: DiffRendererMode): DiffRendererMode => {
        state.mode = mode;
        setTimeout(() => {
          state.key++;
        });
        return state.mode;
      },
      toggle: (): DiffRendererMode => {
        state.mode = state.mode === "lite" ? "full" : "lite";
        setTimeout(() => {
          state.key++;
        });
        return state.mode;
      },
      getMode: (): DiffRendererMode => state.mode,
    }),
    // withNamespace: "useDiffRenderer",
    withDeepSelector: false,
    withStableSelector: true,
  }
);
