/**
 * Per-line syntax highlighting for LiteDiff, backed by the same lowlight
 * engine that powers `@git-diff-view` (so token classes stay consistent).
 *
 * Strategy (borrowed from gemini-cli's CodeColorizer, plus one improvement):
 *  - highlight one line at a time (cheap, cache-friendly),
 *  - FIFO-cache segments by `lang\0text` so repeated renders are free,
 *  - unregistered languages fall back to plain text.
 */

import { highlighter } from "@git-diff-view/lowlight";

import type { DiffAST } from "@git-diff-view/lowlight";

/** Minimal hast node shapes (avoids a direct @types/hast dependency). */
interface HastRoot {
  type: "root";
  children: HastNode[];
}
interface HastText {
  type: "text";
  value: string;
}
interface HastElement {
  type: "element";
  properties?: { className?: string[] };
  children: Array<HastNode>;
}
type HastNode = HastText | HastElement | HastRoot | { type: string };

export interface LiteDiffSegment {
  text: string;
  /** highlight.js class names; resolved to theme colors at render time. */
  classes?: string[];
}

/** Max cached highlighted lines. Explicit FIFO (push/shift) eviction. */
const MAX_HIGHLIGHT_CACHE_ENTRIES = 1024;
/** Skip highlighting for extremely long lines. */
const MAX_HIGHLIGHT_LINE_LENGTH = 500;

const EXT_TO_LANG: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  scss: "scss",
  less: "less",
  html: "xml",
  xml: "xml",
  svg: "xml",
  vue: "vue",
  svelte: "xml",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  sql: "sql",
  swift: "swift",
  lua: "lua",
  dart: "dart",
  graphql: "graphql",
  gql: "graphql",
  diff: "diff",
  patch: "diff",
};

const BASENAME_TO_LANG: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  ".gitignore": "plaintext",
  ".env": "plaintext",
};

/** Map a file path to a registered highlight language, or undefined. */
export function langForPath(path: string): string | undefined {
  const base = path.split("/").pop() ?? path;
  const byBase = BASENAME_TO_LANG[base.toLowerCase()];
  if (byBase) return byBase;
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  const lang = EXT_TO_LANG[ext];
  return lang && highlighter.hasRegisteredCurrentLang(lang) ? lang : undefined;
}

const cache = new Map<string, LiteDiffSegment[]>();
const cacheOrder: string[] = [];

function collectSegments(node: HastNode, inherited: string[], out: LiteDiffSegment[]): void {
  if (node.type === "text") {
    out.push({ text: (node as HastText).value, classes: inherited.length ? inherited : undefined });
    return;
  }
  if (node.type === "element") {
    const el = node as HastElement;
    const classes = [...inherited, ...(el.properties?.className ?? [])];
    for (const child of el.children) collectSegments(child, classes, out);
  }
  if (node.type === "root") {
    for (const child of (node as HastRoot).children) collectSegments(child, inherited, out);
  }
}

/**
 * Highlight a single line into colored segments. Returns undefined when the
 * language is unavailable or the line is too long to be worth it.
 */
export function highlightLine(text: string, lang: string | undefined): LiteDiffSegment[] | undefined {
  if (!lang || text.length > MAX_HIGHLIGHT_LINE_LENGTH) return undefined;

  const key = `${lang}\0${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let segments: LiteDiffSegment[];
  try {
    const ast = highlighter.getAST(text, undefined, lang) as DiffAST | undefined;
    if (!ast) return undefined;
    segments = [];
    collectSegments(ast, [], segments);
  } catch {
    return undefined;
  }

  cache.set(key, segments);
  cacheOrder.push(key);
  while (cacheOrder.length > MAX_HIGHLIGHT_CACHE_ENTRIES) {
    const oldest = cacheOrder.shift();
    if (oldest !== undefined) cache.delete(oldest);
  }
  return segments;
}
