/**
 * Compile-time switch for the message-view diff renderer.
 *
 * - `true`  → LiteDiff (default): hunk-only unified diff, per-line FIFO-cached
 *   highlight, `BG.toolResult` solid block. Cheap to render on stream/re-render.
 * - `false` → legacy `@git-diff-view` EditDiff (full-file Split/Unified view).
 *
 * This is a static const on purpose: bundlers inline it and tree-shake the
 * unused branch, so switching only affects the next build.
 */
export const USE_LITE_DIFF = true;
