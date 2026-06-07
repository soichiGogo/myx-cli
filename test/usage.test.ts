import { test } from "node:test";
import assert from "node:assert/strict";
import { project } from "../src/usage.ts";

const FIVE_HOUR_SEC = 5 * 3600;

// Build a `nowMs` such that exactly `frac` of the window has elapsed before `resetAt`.
function nowForFraction(frac: number, windowSec: number, resetAt: number): number {
  const windowStart = resetAt - windowSec;
  return (windowStart + frac * windowSec) * 1000;
}

test("project: null when inputs are missing", () => {
  assert.equal(project(null, 1000, FIVE_HOUR_SEC, 0), null);
  assert.equal(project(50, null, FIVE_HOUR_SEC, 0), null);
});

test("project: null when less than 5% of the window has elapsed", () => {
  const resetAt = 1_000_000;
  const now = nowForFraction(0.04, FIVE_HOUR_SEC, resetAt);
  assert.equal(project(10, resetAt, FIVE_HOUR_SEC, now), null);
});

test("project: extrapolates at the average pace (pct / fraction)", () => {
  const resetAt = 1_000_000;
  const now = nowForFraction(0.5, FIVE_HOUR_SEC, resetAt);
  // 30% used at the halfway point → on pace for 60% at reset.
  assert.equal(project(30, resetAt, FIVE_HOUR_SEC, now), 60);
});

test("project: caps the projection at 999", () => {
  const resetAt = 1_000_000;
  const now = nowForFraction(0.05, FIVE_HOUR_SEC, resetAt);
  // 80% at just 5% elapsed → 1600, capped to 999.
  assert.equal(project(80, resetAt, FIVE_HOUR_SEC, now), 999);
});

test("project: null once past the reset (fraction > 1)", () => {
  const resetAt = 1_000_000;
  const now = (resetAt + 60) * 1000;
  assert.equal(project(50, resetAt, FIVE_HOUR_SEC, now), null);
});
