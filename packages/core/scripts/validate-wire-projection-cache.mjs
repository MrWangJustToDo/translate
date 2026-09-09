/**
 * Offline validation for wire projection cache hit / miss / invalidate.
 *
 * Run: pnpm --filter @my-agent/core run validate:wire-projection-cache
 */
import assert from "node:assert/strict";

const { WireProjectionCache, wireSourceFingerprint, policyKeyFromOptions, lastMessageContentLen } =
  await import("../dist/dev.mjs");

const msg = (id, text) => ({
  id,
  role: "user",
  parts: [{ type: "text", content: text }],
});

function main() {
  assert.equal(lastMessageContentLen(msg("a", "hello")), 1 + 5);
  assert.equal(policyKeyFromOptions({ keepRecentTokens: 1000 }), "t:1000");
  assert.equal(policyKeyFromOptions({}), "t:0");

  const messages = [msg("a", "x"), msg("b", "yy")];
  const fp1 = wireSourceFingerprint(1, messages, "t:1000");
  const fp2 = wireSourceFingerprint(1, messages, "t:1000");
  assert.equal(fp1, fp2);
  assert.notEqual(fp1, wireSourceFingerprint(2, messages, "t:1000"));
  assert.notEqual(fp1, wireSourceFingerprint(1, [msg("a", "x"), msg("b", "zzz")], "t:1000"));

  const cache = new WireProjectionCache();
  let computes = 0;
  const wireA = [{ role: "user", content: "a" }];
  const out1 = cache.getOrCompute(fp1, () => {
    computes += 1;
    return wireA;
  });
  const out2 = cache.getOrCompute(fp1, () => {
    computes += 1;
    return [{ role: "user", content: "other" }];
  });
  assert.equal(computes, 1);
  assert.equal(out1, out2);
  assert.equal(out1, wireA);

  const fpMiss = wireSourceFingerprint(3, messages, "t:1000");
  const wireB = [{ role: "user", content: "b" }];
  const out3 = cache.getOrCompute(fpMiss, () => {
    computes += 1;
    return wireB;
  });
  assert.equal(computes, 2);
  assert.equal(out3, wireB);

  cache.invalidate();
  assert.equal(cache.peekFingerprint(), null);
  cache.getOrCompute(fpMiss, () => {
    computes += 1;
    return wireB;
  });
  assert.equal(computes, 3);

  console.log("validate:wire-projection-cache OK");
}

main();
