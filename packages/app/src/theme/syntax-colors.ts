/**
 * Syntax highlighting color mapping for LiteDiff.
 *
 * Maps highlight.js class names (produced by `@git-diff-view/lowlight`) onto
 * the active theme's semantic {@link COLORS}. Reading COLORS at render time
 * (instead of baking hex values) keeps LiteDiff in sync with runtime palette
 * switches (`applyColorPalette`).
 */

import { COLORS } from "./colors.js";

/**
 * Ordered most-specific-first: a node may carry several classes (e.g.
 * `hljs-title hljs-title.function_`), and the first matching rule wins.
 */
const SYNTAX_CLASS_COLORS: ReadonlyArray<readonly [RegExp, keyof typeof COLORS]> = [
  [/^hljs-(doctag|template-tag|template-variable|variable\.language_)$/, "danger"],
  [/^hljs-keyword$/, "danger"],
  [/^hljs-type$/, "danger"],
  [/^hljs-title/, "accent"],
  [/^hljs-selector-(attr|class|id|pseudo)$/, "primary"],
  [/^hljs-selector-(tag)$/, "success"],
  [/^hljs-(attr|attribute|literal|meta|number|operator|variable)$/, "primary"],
  [/^hljs-(regexp|string)$/, "success"],
  [/^hljs-(built_in|symbol)$/, "warning"],
  [/^hljs-(comment|code|formula|quote)$/, "muted"],
  [/^hljs-(name|addition)$/, "success"],
  [/^hljs-deletion$/, "danger"],
  [/^hljs-section$/, "primary"],
  [/^hljs-(emphasis|strong|subst)$/, "text"],
];

/**
 * Resolve the theme color for a highlight.js class list.
 * Returns the default text color when nothing matches.
 */
export function syntaxColorForClasses(classes: string[] | undefined): string {
  for (const cls of classes ?? []) {
    for (const [pattern, colorKey] of SYNTAX_CLASS_COLORS) {
      if (pattern.test(cls)) return COLORS[colorKey];
    }
  }
  return COLORS.text;
}
