/**
 * Validates summary-first message-chain projection.
 *
 * Run: pnpm --filter @my-agent/core run validate:message-chain-projection
 */
import { convertMessagesToModelMessages } from "@tanstack/ai";
import assert from "node:assert/strict";

import {
  AgentUIChannel,
  createCompactionSummaryUIMessage,
  findCutPointByBudget,
  findLatestSummaryIndex,
  formatCompactionSummaryContent,
  getModelVisibleMessages,
  isCompactionSummaryModelMessage,
  isCompactionSummaryUIMessage,
} from "../dist/dev.mjs";

const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

// No summary → identity
{
  const messages = [user("a"), assistant("b"), user("c")];
  const visible = getModelVisibleMessages(messages, { keepRecentTokens: 4 });
  assert.deepEqual(visible, messages);
}

// Summary-first with look-back — a token budget that keeps the recent tail but
// drops the oldest turns.
{
  const summary = { role: "user", content: formatCompactionSummaryContent("prior work done") };
  const messages = [
    user("old1"),
    assistant("r1"),
    user("old2"),
    assistant("r2"),
    user("keep1"),
    assistant("rk1"),
    user("keep2"),
    assistant("rk2"),
    summary,
    user("after"),
    assistant("ra"),
  ];

  assert.equal(findLatestSummaryIndex(messages), 8);
  assert.ok(isCompactionSummaryModelMessage(summary));

  const visible = getModelVisibleMessages(messages, { keepRecentTokens: 4 });
  assert.equal(visible[0], summary);
  // Oldest turns are dropped, the recent portion (after the summary) survives.
  assert.ok(!visible.some((m) => m.content === "old1"));
  assert.ok(!visible.some((m) => m.content === "old2"));
  assert.ok(visible.length >= 3, "summary + recent tail + newer messages projected");
  assert.equal(visible[visible.length - 1].role, "assistant");
}

// Budget walk skips summary + synthetic ctx as cut boundaries.
{
  const messages = [
    user("u1"),
    assistant("a1"),
    user("<ctx kind=current_date>\nx\n</ctx>"),
    user("u2"),
    assistant("a2"),
    { role: "user", content: formatCompactionSummaryContent("s") },
    user("u3"),
  ];
  const cut = findCutPointByBudget(messages, 4);
  // Never cut onto a synthetic-context or summary message.
  const cutMessage = messages[cut.cutIndex];
  assert.ok(cutMessage, "expected a cut index");
  assert.ok(!String(cutMessage.content ?? "").includes("<ctx kind"));
  assert.equal(isCompactionSummaryModelMessage(cutMessage), false);
}

// UIMessage detector
{
  const ui = createCompactionSummaryUIMessage("hello");
  assert.ok(isCompactionSummaryUIMessage(ui));
}

// Post-compact same-request wire: convert the chronological channel, then
// project. Channel order stays chronological; wire is summary-first. No
// engine/baseline merge.
{
  const channel = new AgentUIChannel({
    initialMessages: [
      { id: "u1", role: "user", parts: [{ type: "text", content: "old1" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", content: "r1" }] },
      { id: "u2", role: "user", parts: [{ type: "text", content: "keep1" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", content: "rk1" }] },
      { id: "u3", role: "user", parts: [{ type: "text", content: "keep2" }] },
      { id: "a3", role: "assistant", parts: [{ type: "text", content: "rk2" }] },
    ],
  });
  channel.setMessages([...channel.getMessages(), createCompactionSummaryUIMessage("prior work done")]);

  const afterAppend = channel.getMessages();
  assert.equal(afterAppend[0].id, "u1", "channel must stay chronological after compact append");
  assert.ok(isCompactionSummaryUIMessage(afterAppend[afterAppend.length - 1]));

  const wire = getModelVisibleMessages(convertMessagesToModelMessages(afterAppend), { keepRecentTokens: 4 });
  assert.ok(isCompactionSummaryModelMessage(wire[0]), "wire must start with the latest summary");
  assert.ok(!wire.some((m) => typeof m.content === "string" && m.content === "old1"));
  assert.equal(channel.getMessages()[0].id, "u1", "projection must not write wire order back to the channel");
}

console.log("validate:message-chain-projection OK");
