# Tasks: add-token-budget-compaction

## 1. Config & budget resolution

- [x] 1.1 Add `keepRecentTokens?: number` and `reserveTokens?: number` to `CompactionConfig` schema (`packages/core/src/agent/compaction/types.ts`); legacy `keepRecentFlows` subsequently removed (token-budget is the only path)
- [x] 1.2 Add `resolveKeepPolicy(config, modelInfo)` helper (budget vs legacy count; derivation `min(window * ratio, cap)`) with unit-covered defaults in a new validate script
- [x] 1.3 Extend `shouldTriggerAutoCompact` to compute the trigger from `(contextWindow - reserveTokens)` when usage tokens and model window are available (`auto-compact.ts`, wire `ModelInfo` through middleware deps)

## 2. Cut point refactor

- [x] 2.1 Rewrite `findCutPoint` (`cut-point.ts`) as backward token-budget walk returning `{ cutIndex, isSplitTurn, turnStartIndex }`; valid cut points exclude `role: "tool"`, in-chain summaries, explicit summary index, `<turn_context>`
- [x] 2.2 Legacy count-based fallback removed — the no-window case derives the budget from the shared default window (`DEFAULT_SUMMARIZATION_CONTEXT_WINDOW`)
- [x] 2.3 Update/extend `scripts/validate-message-chain-projection.mjs` and add cut-point cases: budget respected, no orphan tool results, split-turn detection, legacy fallback parity

## 3. Projection threading

- [x] 3.1 Extend `GetModelVisibleMessagesOptions` to accept the resolved keep policy; projection output unchanged for unchanged input
- [x] 3.2 Thread config at call sites: `managed-agent.ts getMessagesForLLM`, `managed-agent-compact.ts`, `middleware/compaction-middleware.ts projectWireFromChannel`, `apply-compaction-result.ts` orphan cleanup

## 4. Split-turn summarization

- [x] 4.1 Add `<turn_prefix>` segment support to `serialize-conversation.ts` / `buildSegmentedConversationText` and the turn-prefix prompt section in `compaction-prompt.ts`
- [x] 4.2 Wire split-turn flow in `autoCompact`: detect `isSplitTurn`, summarize prefix (batched via `splitMessagesByTokenBudget`), merge into final SUMMARY before archive/append
- [x] 4.3 Extend `validate:summarization-segments` / `validate:auto-compact-noop` with split-turn scenarios (mid-turn cut merges summary; suffix untouched)

## 5. Reactive compact budget fix

- [x] 5.1 Replace `DEFAULT_REACTIVE_KEEP_TAIL` fixed count with pairing-safe token-budget tail selection (`reactive-compact.ts`)
- [x] 5.2 Extend `validate:reactive-compact` with an oversized-tail case (budget enforced, pairs intact)

## 6. Validation & docs

- [x] 6.1 Run scoped checks: `pnpm --filter @my-agent/core run validate:message-chain-projection validate:auto-compact-noop validate:reactive-compact validate:summarization-segments` plus new script; `pnpm build:core`
- [x] 6.2 Update AGENTS.md compaction sections (cut-point strategy, reactive tail) to describe token-budget behavior
