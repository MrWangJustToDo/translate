/**
 * Validates LiteDiff pure helpers (patch parsing, hunk collapse, truncation).
 *
 * Run: node packages/app/test/lite-diff.test.mjs
 */
import assert from "node:assert/strict";

const { createLiteDiff, parsePatchRows } = await import("../dist/utils/lite-diff.mjs");

const oldFile = ["a", "b", "c", "d", "e", "f", "g", "h"].join("\n");
const newFile = ["a", "b", "c", "D", "e", "f", "g", "X", "Y"].join("\n");

// Basic parse: rows carry correct line numbers and +/- markers.
{
  const { rows, additions, deletions } = createLiteDiff(oldFile, newFile);
  assert.equal(additions, 3); // D, X, Y
  assert.equal(deletions, 2); // d, h (h replaced by X/Y block)
  const adds = rows.filter((r) => r.type === "add").map((r) => r.text);
  assert.deepEqual(adds, ["D", "X", "Y"]);
  const dels = rows.filter((r) => r.type === "del").map((r) => r.text);
  assert.deepEqual(dels, ["d", "h"]);
  // hunk context anchors line numbers (equal until the two files diverge)
  const ctx = rows.filter((r) => r.type === "context");
  assert.ok(ctx.every((r) => typeof r.oldLine === "number" && typeof r.newLine === "number"));
  assert.equal(ctx[0].oldLine, ctx[0].newLine);
}

// Gap collapse: a long untouched middle is hidden behind a gap marker.
{
  const lines = Array.from({ length: 40 }, (_, i) => `line${i}`);
  const modified = [...lines];
  modified[0] = "changed0";
  modified[39] = "changed39";
  const { rows } = createLiteDiff(lines.join("\n"), modified.join("\n"));
  const gaps = rows.filter((r) => r.type === "gap");
  assert.equal(gaps.length, 1);
  const firstAddIdx = rows.findIndex((r) => r.type === "add");
  assert.ok(firstAddIdx > 0, "first hunk comes first");
  const lastAdd = [...rows].reverse().find((r) => r.type === "add");
  assert.equal(lastAdd?.text, "changed39");
  const lastDel = [...rows].reverse().find((r) => r.type === "del");
  assert.equal(lastDel?.text, "line39");
}

// Truncation: maxLines caps rows and reports hidden count.
{
  const lines = Array.from({ length: 40 }, (_, i) => `line${i}`);
  const modified = [...lines];
  modified[0] = "changed0";
  modified[39] = "changed39";
  const { rows, hidden } = createLiteDiff(lines.join("\n"), modified.join("\n"), { maxLines: 5 });
  assert.equal(rows.length, 5);
  assert.ok(hidden > 0);
}

// Identical content → no rows, no additions.
{
  const { rows, additions, deletions } = createLiteDiff(oldFile, oldFile);
  assert.equal(rows.length, 0);
  assert.equal(additions, 0);
  assert.equal(deletions, 0);
}

// New file: everything is an addition → single-column gutter ("add").
{
  const { rows, additions, deletions, columns } = createLiteDiff("", "one\ntwo");
  assert.equal(deletions, 0);
  assert.equal(additions, 2);
  assert.equal(columns, "add");
  assert.deepEqual(
    rows.filter((r) => r.type === "add").map((r) => r.text),
    ["one", "two"]
  );
}

// Deleted file: everything is a deletion → single-column gutter ("del").
{
  const { rows, additions, deletions, columns } = createLiteDiff("one\ntwo", "");
  assert.equal(additions, 0);
  assert.equal(deletions, 2);
  assert.equal(columns, "del");
  assert.deepEqual(
    rows.filter((r) => r.type === "del").map((r) => r.text),
    ["one", "two"]
  );
}

// Mixed edits keep both line-number columns.
{
  const { columns } = createLiteDiff(oldFile, newFile);
  assert.equal(columns, "both");
}

// New file ending with newline: jsdiff appends a phantom trailing empty
// context row (oldLine counter stuck at 0 → renders as "0 12"). It must be
// dropped and the last row must be the final added line.
{
  const { rows, columns } = createLiteDiff("", "const a = 1;\n");
  assert.equal(columns, "add");
  assert.ok(rows.length > 0);
  const last = rows[rows.length - 1];
  assert.equal(last.type, "add");
  assert.equal(last.newLine, 1);
  assert.ok(
    rows.every((r) => r.type === "gap" || r.oldLine !== 0),
    "no oldLine 0 ghost rows"
  );
}

// Trailing newline on both sides also produces a trailing empty context row;
// only real in-file blank lines (middle) survive.
{
  const { rows } = createLiteDiff("x\n\ny\n", "x\n\nz\n");
  const last = rows[rows.length - 1];
  assert.notEqual(last.type, "context");
  assert.equal(last.text, "z");
  const blankMiddle = rows.filter((r) => r.type === "context" && r.text === "");
  assert.equal(blankMiddle.length, 1, "real blank line inside the file stays");
}

// Empty content pair → zero rows without invoking the diff engine.
{
  const { rows } = createLiteDiff("", "");
  assert.equal(rows.length, 0);
}

// parsePatchRows ignores file headers and hunk prelude.
{
  const patch = ["--- a/f.ts", "+++ b/f.ts", "@@ -2,3 +2,3 @@", " ctx", "-old", "+new", " ctx2"].join("\n");
  const rows = parsePatchRows(patch);
  assert.deepEqual(
    rows.map((r) => [r.type, r.text, r.oldLine, r.newLine]),
    [
      ["context", "ctx", 2, 2],
      ["del", "old", 3, undefined],
      ["add", "new", undefined, 3],
      ["context", "ctx2", 4, 4],
    ]
  );
}
