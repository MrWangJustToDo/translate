/**
 * Re-export shim — the implementation lives in `agent/usage/usage-history-service.ts`
 * (co-located with its {@link UsageStore} IO layer) so domain modules (models/,
 * agent/) can import it without violating the boundary gates.
 *
 * Manager-side consumers keep importing from here (unique consumer entry).
 */

export { UsageHistoryService, sharedUsageHistory } from "../../agent/usage/usage-history-service.js";

export type { UsageHistoryResult, UsageRecord, UsageRecordInput } from "../../agent/usage/usage-history-service.js";
