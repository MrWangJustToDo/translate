import { registerModelProviderForEntry, resolveModelInfoFromModelsDev, type LoadedModelsState } from "@my-agent/core";
import { toRaw } from "reactivity-store";

import { useConfig } from "../hooks/use-config.js";
import { getActiveSession } from "../utils/session-resolve.js";

import { registerCommand } from "./utils/registry.js";

// ============================================================================
// /models — switch the model for the current session (models.json entries)
// ============================================================================

function getState(): LoadedModelsState | null {
  const raw = toRaw(useConfig.getReadonlyState().modelsConfig) as unknown as LoadedModelsState | null;
  if (!raw) return null;
  // Deep-clone to strip the store's readonly proxies so entries/models are
  // mutable plain arrays for provider registration.
  return JSON.parse(JSON.stringify(raw)) as LoadedModelsState;
}

function describeEntry(entry: LoadedModelsState["entries"][number]): string {
  if (entry.type === "session") return "session-server";
  if (entry.type === "remote") return "remote-provider";
  return `direct:${entry.style}@${entry.baseURL.replace(/\/+$/, "")}`;
}

function entryLabel(state: LoadedModelsState, index: number, model: string): string {
  const current = state.active.entryIndex === index && state.active.model === model;
  return `${model}${current ? " (current)" : ""}`;
}

function buildOptions(): { label: string; value: string; description: string }[] {
  const state = getState();
  if (!state) return [];
  const options: { label: string; value: string; description: string }[] = [];
  for (let i = 0; i < state.entries.length; i += 1) {
    const entry = state.entries[i];
    for (const model of entry.models) {
      options.push({
        label: entryLabel(state, i, model),
        value: `${i}:${model}`,
        description: describeEntry(entry),
      });
    }
  }
  return options;
}

registerCommand({
  name: "models",
  description: "Switch the model for the current session (models.json entries)",
  usage: "/models [entryIndex:modelId] | /models",
  immediate: false,
  allowCustomInput: true,
  getOptions: buildOptions,
  execute: async (args) => {
    const session = getActiveSession();
    if (!session) {
      return { ok: false, error: "Agent not initialized" };
    }

    const state = getState();
    if (!state || state.entries.length === 0) {
      return { ok: false, error: "No models.json loaded — start with a config source." };
    }

    const trimmed = args.trim();
    if (!trimmed) {
      const lines = state.entries.map(
        (entry, i) =>
          `${i}: ${describeEntry(entry)}` +
          (entry.models.length
            ? ` — ${entry.models.map((m) => (state.active.entryIndex === i && state.active.model === m ? `[${m}]` : m)).join(", ")}`
            : " (no models)")
      );
      return { ok: true, message: `Models:\n${lines.join("\n")}` };
    }

    const colon = trimmed.indexOf(":");
    const entryIndex = colon >= 0 ? Number(trimmed.slice(0, colon)) : 0;
    const model = colon >= 0 ? trimmed.slice(colon + 1) : trimmed;
    if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= state.entries.length) {
      return { ok: false, error: `Invalid entry index "${trimmed}"` };
    }
    const entry = state.entries[entryIndex];
    if (!entry.models.includes(model)) {
      return {
        ok: false,
        error: `"${model}" is not a known model for entry ${entryIndex} (${describeEntry(entry)}). Known: ${entry.models.join(", ") || "none"}`,
      };
    }

    // Build a state snapshot pointing at the target entry so provider
    // registration follows it (remote-provider entries need re-registration).
    // Session entries (remote-session host) skip registration entirely — the
    // server-side session resolves the connection itself on `model.set`.
    if (entry.type !== "session") {
      const targetState: LoadedModelsState = {
        ...state,
        active: { entryIndex, model },
      };
      await registerModelProviderForEntry(targetState);
    }

    const modelInfo = await resolveModelInfoFromModelsDev(model, entry.style);
    const result = await session.dispatch({
      type: "model.set",
      model,
      // Session entries carry no baseURL/apiKey — upstream credentials stay on
      // the agent server, which resolves them from its own models.json/.env.
      ...(entry.type !== "session" && {
        modelStyle: entry.style,
        modelBaseURL: entry.baseURL,
        modelApiKey: entry.apiKey,
      }),
      modelInfo: modelInfo ?? null,
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    // Persist the new active selection so a restart resumes at this model.
    useConfig.getActions().selectModel(entryIndex, model, entry);
    return { ok: true, message: `Switched to ${model} (${describeEntry(entry)})` };
  },
});
