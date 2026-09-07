import { createState } from "reactivity-store";

import type { DiffFile } from "@git-diff-view/core";

/**
 * Max cached diff files. Each entry holds full old/new file content plus
 * computed diff/highlight structures, so an unbounded cache leaks GBs over a
 * long session. Evicted entries regenerate on demand from message props
 * (see EditDiff).
 */
const MAX_DIFF_FILE_ENTRIES = 50;

export const useDiffFileCache = createState(() => ({ state: {} as Record<string, DiffFile>, order: [] as string[] }), {
  withActions: (s) => ({
    setDiffFile: (key: string, value: DiffFile) => {
      // FIFO by first arrival: only newly seen keys join the queue, so the
      // oldest-inserted entry is always evicted first. Object.keys insertion
      // order is unreliable here (re-inserted keys move to the end, numeric
      // keys sort by value), so keep an explicit order queue.
      const isNew = !(key in s.state);
      s.state[key] = value;
      if (isNew) s.order.push(key);
      while (s.order.length > MAX_DIFF_FILE_ENTRIES) {
        const oldest = s.order.shift();
        if (oldest !== undefined) delete s.state[oldest];
      }
    },
    getDiffFile: (key: string) => s.state[key],
    clear: () => {
      s.state = {};
      s.order = [];
    },
  }),
});

(globalThis as any).useDiffFileCache = useDiffFileCache;
