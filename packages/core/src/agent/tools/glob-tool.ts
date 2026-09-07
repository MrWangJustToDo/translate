import { z } from "zod";

import { getEnv } from "../../env.js";

import { defineServerTool } from "./runtime/define-tool.js";
import { OUTPUT_LIMITS, withDuration } from "./util/helpers.js";
import { DEFAULT_EXCLUDE_DIRS, SEARCH_COMMAND_TIMEOUT } from "./util/search-command.js";
import { maybeCacheOutput } from "./util/tool-output-cache.js";
import { globOutputSchema } from "./util/types.js";

import type { GlobOutput } from "./util/types.js";

/** Default number of files to return per page */
const DEFAULT_LIMIT = OUTPUT_LIMITS.MAX_ARRAY_ITEMS;

function buildFdCommand(
  binary: "fd" | "fdfind",
  pattern: string,
  searchPath: string,
  options: {
    type: string;
    exclude: string | undefined;
    fetchCount: number;
  }
): string {
  const args: string[] = ["--color=never"];

  if (options.type === "directory") {
    args.push("--type", "directory");
  } else if (options.type === "file") {
    args.push("--type", "file");
  }

  args.push("--glob", `"${pattern}"`);

  for (const dir of DEFAULT_EXCLUDE_DIRS) {
    args.push("--exclude", `"${dir}"`);
  }

  if (options.exclude) {
    args.push("--exclude", `"${options.exclude}"`);
  }

  return `set -o pipefail; ${binary} ${args.join(" ")} "${searchPath}" 2>/dev/null | head -n ${options.fetchCount}`;
}

function buildFindCommand(
  pattern: string,
  searchPath: string,
  options: {
    type: string;
    exclude: string | undefined;
    fetchCount: number;
  }
): string {
  let typeFlag: string;
  if (options.type === "directory") {
    typeFlag = "-type d";
  } else if (options.type === "file") {
    typeFlag = "-type f";
  } else {
    typeFlag = "";
  }

  const namePattern = pattern.includes("**") ? pattern.replace(/\*\*\//g, "") : pattern;
  const hasPathSeparator = pattern.includes("/");

  let command: string;
  if (hasPathSeparator) {
    const findPath = pattern.replace(/\*\*/g, "*");
    command = `find ${searchPath} ${typeFlag} -path "${findPath}" 2>/dev/null`;
  } else {
    command = `find ${searchPath} ${typeFlag} -name "${namePattern}" 2>/dev/null`;
  }

  for (const dir of DEFAULT_EXCLUDE_DIRS) {
    command += ` -not -path "*/${dir}/*" -not -path "*/${dir}"`;
  }

  if (options.exclude) {
    command += ` -not -path "*/${options.exclude}/*" -not -path "*/${options.exclude}"`;
  }

  return `set -o pipefail; ${command} | head -n ${options.fetchCount}`;
}

async function runGlobSearch(
  pattern: string,
  searchPath: string,
  options: {
    type: string;
    exclude: string | undefined;
    fetchCount: number;
  }
): Promise<string> {
  const env = getEnv();
  const timeout = SEARCH_COMMAND_TIMEOUT;
  const fdCommand = buildFdCommand("fd", pattern, searchPath, options);
  const fdResult = await env.runCommand(fdCommand, { timeout });
  if (fdResult.exitCode !== 127) {
    return fdResult.stdout;
  }

  const fdfindCommand = buildFdCommand("fdfind", pattern, searchPath, options);
  const fdfindResult = await env.runCommand(fdfindCommand, { timeout });
  if (fdfindResult.exitCode !== 127) {
    return fdfindResult.stdout;
  }

  const findResult = await env.runCommand(buildFindCommand(pattern, searchPath, options), { timeout });
  return findResult.stdout;
}

export const createGlobTool = () => {
  return defineServerTool({
    name: "glob",
    description:
      "Finds paths matching a glob pattern (e.g. '**/*.ts', 'src/**/*.json'). Prefer over tree/list_file when you know a filename pattern; use grep to search file contents. " +
      "Uses `fd` when available (respects .gitignore), falls back to `find`. " +
      "Supports pagination, type filtering (file/directory), and automatic exclusion of common non-source directories.",
    inputSchema: z.object({
      pattern: z
        .string()
        .describe("Glob pattern, relative to `path` (e.g. '**/*.js', 'src/**/*.ts'); use `**/` prefix for any depth."),
      path: z.string().optional().describe("Search directory, relative to project root (default: current)."),
      type: z
        .enum(["file", "directory", "all"])
        .optional()
        .describe("Type of entries to find: 'file' (default), 'directory', or 'all' for both."),
      offset: z
        .number()
        .int({ message: "offset: must be an integer" })
        .min(0, { message: "offset: must be >= 0 (0-indexed)" })
        .optional()
        .describe("Number of files to skip (0-indexed). Use for pagination. Defaults to 0."),
      limit: z
        .number()
        .int({ message: "limit: must be an integer" })
        .min(1, { message: "limit: must be >= 1" })
        .max(DEFAULT_LIMIT, { message: "limit: exceeds maximum" })
        .optional()
        .describe(`Maximum number of files to return. Defaults to ${DEFAULT_LIMIT}.`),
      exclude: z
        .string()
        .optional()
        .describe("Additional directory or file pattern to exclude (e.g., 'vendor', '*.log')."),
    }),
    outputSchema: globOutputSchema,
    execute: async ({ pattern, path, type, offset, limit, exclude }, { toolCallId }) => {
      return withDuration(async () => {
        const searchPath = path ?? ".";
        const skip = offset ?? 0;
        const take = limit ?? DEFAULT_LIMIT;
        const fileType = type ?? "file";
        const fetchCount = skip + take + 1;

        const searchOptions = {
          type: fileType,
          exclude,
          offset: skip,
          limit: take,
          fetchCount,
        };

        const rawOutput = await runGlobSearch(pattern, searchPath, searchOptions);

        const allFiles = rawOutput
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        if (allFiles.length === 0) {
          return {
            files: [] as string[],
            content: "",
            offset: skip,
            limit: take,
            cachedOutputPath: null,
          };
        }

        const paginatedFiles = allFiles.slice(skip, skip + take);

        const fullOutputText = paginatedFiles.join("\n");
        const cached = await maybeCacheOutput(fullOutputText, `${toolCallId}-glob`);
        const { cachedOutputPath } = cached;

        // files always carries the requested page (structured metadata for the UI
        // and external_* consumers) — `content` holds the model preview (cached
        // head/tail for large results) and `cachedOutputPath` the full list on disk.
        return {
          files: paginatedFiles,
          content: cached.content,
          offset: skip,
          limit: take,
          cachedOutputPath,
        };
      });
    },
    // Only send the file list to the LLM — pattern/path are echoed in the
    // input, pagination/truncation/cache metadata is for the UI only.
    toModelOutput({ output }: { toolCallId: string; input: unknown; output: GlobOutput }) {
      return [
        {
          type: "text" as const,
          content:
            `offset(current pagination): ${output.offset}; limit(Maximum number of items to return): ${output.limit}` +
            (output.content || output.files?.join("\n")),
        },
      ];
    },
  });
};
