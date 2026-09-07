import { createState } from "reactivity-store";

import type { DiffFile } from "@git-diff-view/core";

/**
 * Max cached diff files. Each entry holds full old/new file content plus
 * computed diff/highlight structures, so an unbounded cache leaks GBs over a
 * long session. Evicted entries regenerate on demand from message props
 * (see EditDiff).
 */
const MAX_DIFF_FILE_ENTRIES = 50;

export const useDiffFileCache = createState(() => ({ state: {} as Record<string, DiffFile> }), {
  withActions: (s) => ({
    setDiffFile: (key: string, value: DiffFile) => {
      s.state[key] = value;
      // Insertion-ordered eviction (string keys preserve insertion order).
      const keys = Object.keys(s.state);
      if (keys.length > MAX_DIFF_FILE_ENTRIES) {
        for (const oldest of keys.slice(0, keys.length - MAX_DIFF_FILE_ENTRIES)) {
          delete s.state[oldest];
        }
      }
    },
    getDiffFile: (key: string) => s.state[key],
    clear: () => (s.state = {}),
  }),
});

(globalThis as any).useDiffFileCache = useDiffFileCache;
