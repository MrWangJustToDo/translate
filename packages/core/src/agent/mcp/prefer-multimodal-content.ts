/**
 * Workaround for @tanstack/ai-mcp dropping MCP `content[]` when `structuredContent` is present.
 *
 * Screenshot-style tools put metadata in structuredContent and images in content[].
 * TanStack's makeMcpExecute prefers structuredContent and discards multimodal content.
 * We resolve results ourselves so vision-capable parts reach the model.
 */

import type { AnyServerTool } from "@tanstack/ai";
import type { MCPClient } from "@tanstack/ai-mcp";

// ============================================================================
// Types
// ============================================================================

export type McpContentBlock = {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: unknown;
};

export type McpCallToolResult = {
  isError?: boolean;
  content?: McpContentBlock[];
  structuredContent?: unknown;
};

export type TanStackContentPart =
  { type: "text"; content: string } | { type: "image"; source: { type: "data"; value: string; mimeType: string } };

const MULTIMODAL_CONTENT_TYPES = new Set(["image", "audio", "video", "resource"]);

// ============================================================================
// Content conversion
// ============================================================================

/** True when MCP content[] includes non-text blocks the model should see as media. */
export function mcpContentHasMultimodal(content: McpContentBlock[] | undefined): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((block) => MULTIMODAL_CONTENT_TYPES.has(block.type));
}

/**
 * Convert MCP content blocks to TanStack ContentPart[] (or a single string for text-only).
 * Mirrors @tanstack/ai-mcp mcpContentToTanstack.
 */
export function mcpContentToTanstack(content: McpContentBlock[] | undefined): string | TanStackContentPart[] {
  if (!Array.isArray(content)) return "";
  if (content.length === 1 && content[0]?.type === "text") {
    return content[0].text ?? "";
  }

  const parts: TanStackContentPart[] = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        parts.push({ type: "text", content: block.text ?? "" });
        break;
      case "image":
        if (typeof block.data === "string" && typeof block.mimeType === "string") {
          parts.push({
            type: "image",
            source: { type: "data", value: block.data, mimeType: block.mimeType },
          });
        }
        break;
      case "resource": {
        const uri =
          block.resource && typeof block.resource === "object" && "uri" in block.resource
            ? (block.resource as { uri?: unknown }).uri
            : undefined;
        if (typeof uri === "string" && uri.startsWith("ui://")) {
          break;
        }
        parts.push({ type: "text", content: JSON.stringify(block.resource) });
        break;
      }
      default:
        parts.push({ type: "text", content: JSON.stringify(block) });
    }
  }

  const filtered = parts.filter((part) => !(part.type === "text" && part.content === ""));
  return filtered.length > 0 ? filtered : "";
}

/**
 * Prefer multimodal content[] when present; otherwise keep TanStack's structuredContent preference.
 */
export function resolveMcpToolExecuteResult(toolName: string, result: McpCallToolResult): unknown {
  if (result.isError) {
    const text = Array.isArray(result.content) ? mcpContentToTanstack(result.content) : undefined;
    const detail = typeof text === "string" ? text : text === undefined ? undefined : JSON.stringify(text);
    throw new Error(
      !detail ? `MCP tool "${toolName}" returned an error` : `MCP tool "${toolName}" returned an error: ${detail}`
    );
  }

  if (mcpContentHasMultimodal(result.content)) {
    return mcpContentToTanstack(result.content);
  }

  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }

  return mcpContentToTanstack(result.content);
}

function readServerToolName(tool: AnyServerTool): string | undefined {
  const mcp = tool.metadata?.mcp;
  if (!mcp || typeof mcp !== "object") return undefined;
  const name = (mcp as { serverToolName?: unknown }).serverToolName;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

/**
 * Replace TanStack MCP tool execute so multimodal content[] is not discarded.
 */
export function wrapMcpToolForMultimodalContent(tool: AnyServerTool, client: MCPClient): AnyServerTool {
  const serverToolName = readServerToolName(tool);
  if (!serverToolName || typeof tool.execute !== "function") {
    return tool;
  }

  return {
    ...tool,
    execute: async (args, ctx) => {
      ctx?.abortSignal?.throwIfAborted();
      const result = (await client.callTool(
        serverToolName,
        (args ?? {}) as Record<string, unknown>
      )) as McpCallToolResult;
      return resolveMcpToolExecuteResult(serverToolName, result);
    },
  };
}
