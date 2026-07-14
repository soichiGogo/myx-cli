import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSessionName } from "../src/launch.ts";

// `exists` predicate backed by a fixed set — no tmux needed.
const withSessions = (...names: string[]) => {
  const set = new Set(names);
  return (name: string) => set.has(name);
};

test("nextSessionName: free base name is used as-is", () => {
  assert.equal(nextSessionName("myx", withSessions()), "myx");
  assert.equal(nextSessionName("myx", withSessions("other")), "myx");
});

test("nextSessionName: taken base falls through to the first free -N", () => {
  assert.equal(nextSessionName("myx", withSessions("myx")), "myx-2");
  assert.equal(nextSessionName("myx", withSessions("myx", "myx-2")), "myx-3");
  // gaps are filled: myx-2 free even though myx-3 exists
  assert.equal(nextSessionName("myx", withSessions("myx", "myx-3")), "myx-2");
});

test("nextSessionName: honors a custom base", () => {
  assert.equal(nextSessionName("work", withSessions("work")), "work-2");
});

test("nextSessionName: throws when the whole -N range is exhausted", () => {
  const all = withSessions("myx", ...Array.from({ length: 998 }, (_, i) => `myx-${i + 2}`));
  assert.throws(() => nextSessionName("myx", all), /too many/);
});
