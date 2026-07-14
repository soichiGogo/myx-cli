import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFamily,
  familyOrder,
  formatIdle,
  formatSessionsTable,
  type SessionRow,
} from "../src/sessions.ts";

test("isFamily: base itself and base-N are family; lookalikes are not", () => {
  assert.equal(isFamily("myx", "myx"), true);
  assert.equal(isFamily("myx-2", "myx"), true);
  assert.equal(isFamily("myx-old", "myx"), true); // any base-<suffix>
  assert.equal(isFamily("myxfoo", "myx"), false); // no dash boundary
  assert.equal(isFamily("other", "myx"), false);
});

test("familyOrder: base first, then numeric suffix, oddballs last", () => {
  const names = ["myx-3", "myx", "myx-10", "myx-2", "myx-old"];
  const sorted = [...names].sort((a, b) => familyOrder(a, "myx") - familyOrder(b, "myx"));
  assert.deepEqual(sorted, ["myx", "myx-2", "myx-3", "myx-10", "myx-old"]);
});

test("formatIdle: buckets seconds into <1m / m / h / d", () => {
  assert.equal(formatIdle(0), "<1m");
  assert.equal(formatIdle(59), "<1m");
  assert.equal(formatIdle(60), "1m");
  assert.equal(formatIdle(125), "2m");
  assert.equal(formatIdle(3600), "1h");
  assert.equal(formatIdle(7200), "2h");
  assert.equal(formatIdle(86400), "1d");
  assert.equal(formatIdle(200000), "2d");
});

test("formatSessionsTable: aligned columns, 1-based index, current tagged", () => {
  const rows: SessionRow[] = [
    { name: "myx", dir: "myx-cli", idleSeconds: 5, attached: true, current: true },
    { name: "myx-2", dir: "web-app", idleSeconds: 7200, attached: false, current: false },
  ];
  const lines = formatSessionsTable(rows).split("\n");
  assert.match(lines[0]!, /#\s+session\s+dir\s+idle\s+client/);
  assert.match(lines[1]!, /\b1\s+myx\s+myx-cli\s+<1m\s+attached\s+\(this\)/);
  assert.match(lines[2]!, /\b2\s+myx-2\s+web-app\s+2h\s+-/);
  assert.ok(!lines[2]!.includes("(this)"));
  // the "session" column is padded to the widest name ("myx-2"), so the two data
  // rows' dir columns start at the same offset.
  assert.equal(lines[1]!.indexOf("myx-cli"), lines[2]!.indexOf("web-app"));
});
