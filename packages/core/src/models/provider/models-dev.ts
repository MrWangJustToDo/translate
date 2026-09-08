/**
 * models.dev API integration — fetches up-to-date model metadata from
 * https://models.dev/api.json instead of hardcoding it in provider files.
 *
 * The API returns a flat map of providers, each with a nested map of models.
 * We transform the relevant fields into our {@link ModelInfo} shape.
 *
 * Caching:
 * - In-memory cache for the process lifetime.
 * - Optional disk cache at `<rootPath>/.agents/cache/models-dev.json` with
 *   a 24h TTL, so offline launches still work.
 */

import { getEnv } from "../../env.js";

import type { ModelCapability, ModelInfo, ModelStyle, ReasoningEffort } from "../types.js";

// ============================================================================
// Constants
// ============================================================================

export const MODELS_DEV_URL = "https://models.dev/api.json";

/** Effort values we recognize from models.dev `reasoning_options`. */
const REASONING_EFFORTS = new Set<ReasoningEffort>(["none", "low", "medium", "high", "xhigh", "max", "minimal"]);

/** Disk cache TTL in milliseconds (24 hours). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function resolveStyleFromModelsDevVendor(vendorId: string): ModelStyle {
  return vendorId === "anthropic" ? "anthropic" : "openai";
}

// ============================================================================
// Types (minimal — only the fields we consume)
// ============================================================================

interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

interface ModelsDevLimit {
  context?: number;
  output?: number;
}

interface ModelsDevModel {
  id?: string;
  name?: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  reasoning_options?: unknown[];
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  modalities?: { input?: string[]; output?: string[] };
  limit?: ModelsDevLimit;
  cost?: ModelsDevCost;
  status?: string;
}

interface ModelsDevProvider {
  id: string;
  name?: string;
  env?: string[];
  npm?: string;
  api?: string;
  models?: Record<string, ModelsDevModel>;
}

type ModelsDevData = Record<string, ModelsDevProvider>;

// ============================================================================
// Cache
// ============================================================================

let memoryCache: ModelsDevData | null = null;

function getCachePath(): string {
  const env = getEnv();
  return env.path.join(env.rootPath, ".agents", "cache", "models-dev.json");
}

async function readDiskCache(): Promise<ModelsDevData | null> {
  try {
    const env = getEnv();
    const path = getCachePath();
    const stat = await env.fs.stat(path);
    if (!stat) return null;
    // Check TTL
    const mtimeMs = stat.mtime instanceof Date ? stat.mtime.getTime() : Number(stat.mtime);
    if (Date.now() - mtimeMs > CACHE_TTL_MS) {
      return null;
    }
    const content = await env.fs.readFile(path);
    return JSON.parse(content as string) as ModelsDevData;
  } catch {
    return null;
  }
}

async function writeDiskCache(data: ModelsDevData): Promise<void> {
  try {
    const env = getEnv();
    const path = getCachePath();
    const dir = env.path.dirname(path);
    // Ensure directory exists (recursive mkdir)
    try {
      await env.fs.stat(dir);
    } catch {
      await env.fs.mkdir(dir);
    }
    await env.fs.writeFile(path, JSON.stringify(data, null, 2));
  } catch {
    // Disk cache is best-effort; ignore errors.
  }
}

// ============================================================================
// Fetch
// ============================================================================

/** Timeout for the models.dev fetch — metadata is best-effort, never stall startup. */
const MODELS_DEV_FETCH_TIMEOUT_MS = 5_000;

/**
 * Fetch the full models.dev dataset, using in-memory and disk caches.
 *
 * @throws if the fetch fails and no cache is available.
 */
export async function fetchModelsDev(): Promise<ModelsDevData> {
  if (memoryCache) return memoryCache;

  const env = getEnv();
  try {
    const response = await env.fetch(MODELS_DEV_URL, {
      // An unreachable models.dev must not hang model resolution (CLI startup,
      // `POST /api/agent`, im-bridge bootstrap) — fail over to the disk cache.
      signal: AbortSignal.timeout(MODELS_DEV_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as ModelsDevData;
    memoryCache = data;
    await writeDiskCache(data);
    return data;
  } catch (err) {
    // Fallback to disk cache on network failure
    const disk = await readDiskCache();
    if (disk) {
      memoryCache = disk;
      return disk;
    }
    throw new Error(
      `Failed to fetch model metadata from ${MODELS_DEV_URL}: ${(err as Error).message}. ` +
        `No cached data available. Check your network connection or configure model metadata via MODEL_* env vars.`
    );
  }
}

// ============================================================================
// Transform
// ============================================================================

/**
 * Convert a models.dev model entry into our {@link ModelInfo}.
 */
function parseModelsDevModel(vendorId: string, modelId: string, data: ModelsDevModel): ModelInfo {
  const style = resolveStyleFromModelsDevVendor(vendorId);

  const capabilities: ModelCapability[] = ["streaming"];
  if (data.reasoning) capabilities.push("reasoning");
  if (data.attachment) {
    capabilities.push("vision");
    capabilities.push("document");
  }
  if (data.tool_call) capabilities.push("tool_calling");
  if (data.structured_output) capabilities.push("json_output");
  if (data.cost?.cache_read !== undefined || data.cost?.cache_write !== undefined) {
    capabilities.push("prompt_caching");
  }

  // Prefer modalities.input when present (more precise than attachment boolean).
  const inputModalities = data.modalities?.input ?? [];
  if (inputModalities.includes("image") && !capabilities.includes("vision")) {
    capabilities.push("vision");
  }
  if (inputModalities.includes("audio") && !capabilities.includes("audio")) {
    capabilities.push("audio");
  }
  if (inputModalities.includes("video") && !capabilities.includes("video")) {
    capabilities.push("video");
  }
  if (
    (inputModalities.includes("pdf") || inputModalities.includes("document") || inputModalities.includes("file")) &&
    !capabilities.includes("document")
  ) {
    capabilities.push("document");
  }

  const pricing = data.cost
    ? {
        inputPerM: data.cost.input ?? 0,
        outputPerM: data.cost.output ?? 0,
        ...(data.cost.cache_read !== undefined ? { cacheReadPerM: data.cost.cache_read } : {}),
        ...(data.cost.cache_write !== undefined ? { cacheWritePerM: data.cost.cache_write } : {}),
      }
    : undefined;

  // Derive reasoningConfig from reasoning_options if present
  let reasoningConfig: ModelInfo["reasoningConfig"];
  if (data.reasoning && Array.isArray(data.reasoning_options)) {
    const effortOpt = data.reasoning_options.find(
      (o) => typeof o === "object" && o !== null && (o as { type?: string }).type === "effort"
    ) as { values?: string[] } | undefined;
    const effortValues = (effortOpt?.values ?? []).filter(
      (v): v is ReasoningEffort => typeof v === "string" && REASONING_EFFORTS.has(v as ReasoningEffort)
    );
    const hasMedium = effortValues.includes("medium");
    reasoningConfig = {
      ...(effortValues.length > 0 ? { effortValues } : {}),
      ...(hasMedium ? { defaultEffort: "medium" } : effortValues.length > 0 ? { defaultEffort: effortValues[0] } : {}),
    };
  }

  return {
    id: modelId,
    name: data.name ?? modelId,
    style,
    apiModel: data.id ?? modelId,
    contextWindow: data.limit?.context ?? 0,
    defaultMaxTokens: data.limit?.output ?? 0,
    ...(pricing ? { pricing } : {}),
    capabilities,
    ...(reasoningConfig ? { reasoningConfig } : {}),
  };
}

// ============================================================================
// Lookup
// ============================================================================

/**
 * Look up a single model by ID from the models.dev dataset.
 *
 * Lookup strategies (first match wins):
 * 1. Prefixed: `"anthropic/claude-opus-4-8"` → search provider `anthropic`
 *    for model `claude-opus-4-8`.
 * 2. Hint-based: if `styleHint` is `"anthropic"`, search the anthropic vendor only.
 * 3. Bare: search all vendors by the bare model id (prefix stripped).
 *
 * @param modelId The model identifier to look up (may be prefixed).
 * @param styleHint Optional {@link ModelStyle} to narrow the search.
 * @returns The resolved {@link ModelInfo}, or `undefined` if not found.
 */
export async function lookupModelFromModelsDev(
  modelId: string,
  styleHint?: ModelStyle
): Promise<ModelInfo | undefined> {
  const data = await fetchModelsDev();

  // Split "provider/model" once so all strategies can reuse the bare id.
  // e.g. "zhipu/glm-5.2" → provPart="zhipu", bareId="glm-5.2"
  const slashIdx = modelId.indexOf("/");
  const provPart = slashIdx >= 0 ? modelId.slice(0, slashIdx) : undefined;
  const bareId = slashIdx >= 0 ? modelId.slice(slashIdx + 1) : modelId;

  // 1. Prefixed lookup: "provider/model" — exact provider match.
  if (provPart) {
    const provData = data[provPart];
    const modelData = provData?.models?.[bareId] ?? provData?.models?.[modelId];
    if (modelData) {
      return parseModelsDevModel(provPart, bareId, modelData);
    }
  }

  // 2. Hint-based lookup — anthropic style maps to the anthropic vendor on models.dev.
  if (styleHint === "anthropic") {
    const provData = data.anthropic;
    const modelData = provData?.models?.[bareId] ?? provData?.models?.[modelId];
    if (modelData) {
      return parseModelsDevModel("anthropic", bareId, modelData);
    }
  }

  // 3. Bare lookup — search all providers by the bare model id.
  //    This catches cases where the user's provider prefix differs from
  //    models.dev (e.g. "zhipu/glm-5.2" → models.dev has it under "zai").
  //    Multiple providers may carry the same model id; pick the one with the
  //    richest metadata so contextWindow / pricing / capabilities are accurate.
  const bareMatches: Array<{ provId: string; modelData: ModelsDevModel; score: number }> = [];
  for (const [provId, provData] of Object.entries(data)) {
    const modelData = provData.models?.[bareId] ?? provData.models?.[modelId];
    if (!modelData) continue;
    bareMatches.push({ provId, modelData, score: scoreModelEntry(modelData) });
  }
  if (bareMatches.length > 0) {
    bareMatches.sort((a, b) => b.score - a.score);
    const best = bareMatches[0]!;
    return parseModelsDevModel(best.provId, bareId, best.modelData);
  }

  return undefined;
}

/**
 * Score a models.dev model entry by metadata richness. Higher is better.
 *
 * Used to pick the best match when the same model id appears under multiple
 * providers (e.g. `glm-5.2` is listed under `zai`, `zhipuai`, `siliconflow`,
 * …). We prefer entries that have:
 *   - non-zero pricing (real paid providers tend to have complete metadata)
 *   - a context window
 *   - an output limit
 *   - capability flags (reasoning, tool_call, …)
 *
 * Entries with zero pricing (free / coding-plan tiers) rank below paid ones
 * because their metadata is sometimes incomplete.
 */
function scoreModelEntry(data: ModelsDevModel): number {
  let score = 0;
  // Pricing — non-zero pricing signals a real paid listing with full metadata.
  if (data.cost) {
    const hasInput = data.cost.input !== undefined && data.cost.input > 0;
    const hasOutput = data.cost.output !== undefined && data.cost.output > 0;
    if (hasInput && hasOutput) score += 100;
    else if (hasInput || hasOutput)
      score += 50; // zero-price but present
    else score += 10; // cost object exists but all zero/missing
  }
  if (data.limit?.context) score += 20;
  if (data.limit?.output) score += 10;
  if (data.reasoning !== undefined) score += 5;
  if (data.tool_call !== undefined) score += 5;
  if (data.attachment !== undefined) score += 5;
  if (data.structured_output !== undefined) score += 5;
  if (data.modalities) score += 5;
  if (data.knowledge) score += 2;
  if (data.release_date) score += 2;
  return score;
}

/**
 * Get all models for a models.dev vendor id (e.g. "anthropic", "openai", "deepseek").
 */
export async function getModelsByProviderFromModelsDev(vendorId: string): Promise<ModelInfo[]> {
  const data = await fetchModelsDev();
  const provData = data[vendorId];
  if (!provData?.models) return [];

  return Object.entries(provData.models).map(([modelId, modelData]) =>
    parseModelsDevModel(vendorId, modelId, modelData)
  );
}
