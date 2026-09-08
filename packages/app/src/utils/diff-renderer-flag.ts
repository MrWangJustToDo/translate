/**
 * Default renderer for the message-view diff preview, seeding the runtime
 * {@link import("../hooks/use-diff-renderer.js").useDiffRenderer} store.
 *
 * - `true`  → LiteDiff: hunk-only unified diff, per-line FIFO-cached
 *   highlight, `BG.toolResult` solid block. Cheap to render on stream/re-render.
 * - `false` → legacy `@git-diff-view` EditDiff (full-file Split/Unified view).
 *
 * Both renderers stay bundled (`EditDiff` is statically imported); this const
 * only decides which mode `/appearance` starts in.
 */
export const USE_LITE_DIFF = true;
