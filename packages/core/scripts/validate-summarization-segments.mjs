/**
 * Validates segmented summarization prompt construction (labels + cut index).
 *
 * Run: pnpm --filter @my-agent/core run validate:summarization-segments
 */

import assert from "node:assert/strict";

import {
  buildCompactionPrompt,
  buildSegmentedConversationText,
  buildSummarizationUserPrompt,
  STILL_IN_CONTEXT_RULES,
} from "../dist/dev.mjs";

const messages = [
  { role: "user", content: "First request about auth" },
  { role: "assistant", content: "Working on auth" },
  { role: "user", content: "Second request about tests" },
  { role: "assistant", content: "Writing tests" },
  { role: "user", content: "Third request about docs" },
  { role: "assistant", content: "Updating docs" },
];

// Cut math (pairing-safe token-budget walk) is validated separately in
// validate-compaction-keep-policy / validate-message-chain-projection. Here we
// pick a fixed cut index to exercise segmentation prompt construction.
const keepRecent = 2;
const llmCutIndex = 2;

const toCompress = messages.slice(0, llmCutIndex);
const stillInContext = messages.slice(llmCutIndex);

assert.equal(toCompress.length, 2);
assert.equal(stillInContext[0].content, "Second request about tests");

const segmented = buildSegmentedConversationText(toCompress, stillInContext);
assert.match(segmented, /<to_compress>/);
assert.match(segmented, /<\/to_compress>/);
assert.match(segmented, /<still_in_context>/);
assert.match(segmented, /<\/still_in_context>/);
assert.match(segmented, /First request about auth/);
assert.match(segmented, /Second request about tests/);
assert.doesNotMatch(segmented, /<conversation>/);

const prompt = buildSummarizationUserPrompt(toCompress, { stillInContext });
assert.match(prompt, /<to_compress>/);
assert.match(prompt, /<still_in_context>/);
assert.match(prompt, /Segment rules/);
assert.ok(prompt.includes(STILL_IN_CONTEXT_RULES));

const withoutStill = buildSummarizationUserPrompt(toCompress);
assert.match(withoutStill, /<to_compress>/);
assert.doesNotMatch(withoutStill, /<still_in_context>/);
assert.doesNotMatch(withoutStill, /Segment rules/);

const instruction = buildCompactionPrompt({ hasStillInContext: true });
assert.match(instruction, /Do NOT restate/);

// Prior ## Compact archives must not be fed into <previous-summary> (instruction text may still mention the section name).
const withArchives = buildCompactionPrompt({
  existingSummary: `## Goal\n\nShip it\n\n## Compact archives\n\n- \`.agents/transcripts/ses/compact-1.md\``,
});
assert.match(withArchives, /<previous-summary>/);
const prevBlock = withArchives.match(/<previous-summary>\n([\s\S]*?)\n<\/previous-summary>/)?.[1] ?? "";
assert.match(prevBlock, /## Goal/);
assert.doesNotMatch(prevBlock, /## Compact archives/);
assert.doesNotMatch(prevBlock, /compact-1\.md/);
assert.match(withArchives, /Do NOT copy or restate archive file paths/);

// Cut index must stay relative to input messages for applyCompactionResult.
const cutIndex = llmCutIndex; // no previous summary offset
assert.equal(cutIndex, 2);

console.log("summarization-segments validation passed");
