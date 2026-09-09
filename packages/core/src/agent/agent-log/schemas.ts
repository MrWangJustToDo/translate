import { z } from "zod";

// ============================================================================
// Zod Schemas
// ============================================================================

const logLevels = ["debug", "info", "warn", "error"] as const;
export const logLevelSchema = z.enum(logLevels);

const logCategories = [
  "agent",
  "chat",
  "llm",
  "tool",
  "approval",
  "compaction",
  "todo",
  "skill",
  "memory",
  "hooks",
  "system",
] as const;
export const logCategorySchema = z.enum(logCategories);

export const logEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  level: logLevelSchema,
  category: logCategorySchema,
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
  run: z.string().optional(),
  event: z.string().optional(),
});
