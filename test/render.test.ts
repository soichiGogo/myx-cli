import { test } from "node:test";
import assert from "node:assert/strict";
import { bar, dur, renderFrame, vis } from "../src/render.ts";
import type { UsageSnapshot } from "../src/types.ts";

const STRIP_ANSI = /\x1b\[[0-9;]*m/g;
const plain = (s: string): string => s.replace(STRIP_ANSI, "");

function snap(over: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    fiveHourPct: 28,
    fiveHourResetAt: null,
    sevenDayPct: 35,
    sevenDayResetAt: null,
    projectedFiveHourPct: 44,
    projectedSevenDayPct: 64,
    updatedAt: 0,
    stale: false,
    ...over,
  };
}

test("dur: compact m / h / h+m / d / d+h, clamping negatives", () => {
  assert.equal(dur(23), "23m");
  assert.equal(dur(240), "4h");
  assert.equal(dur(198), "3h18m");
  assert.equal(dur(2 * 1440), "2d");
  assert.equal(dur(5 * 1440 + 3 * 60), "5d3h");
  assert.equal(dur(-5), "0m");
});

test("bar: fills proportionally and clamps out-of-range fractions", () => {
  assert.equal(bar(0, 10), "░".repeat(10));
  assert.equal(bar(1, 10), "█".repeat(10));
  assert.equal(bar(0.5, 10), "█".repeat(5) + "░".repeat(5));
  assert.equal(bar(2, 10), "█".repeat(10));
});

test("vis: counts emoji as width 2", () => {
  assert.equal(vis("5h"), 2);
  assert.equal(vis("⏳"), 2);
  assert.equal(vis("→44%"), 4);
});

test("renderFrame: two aligned bars labelled 5h and 7d", () => {
  const [line5h = "", line7d = ""] = renderFrame(snap(), { width: 40, now: 0 }).split("\n");
  assert.match(plain(line5h), /^5h /);
  assert.match(plain(line7d), /^7d /);
  const barLen = (s: string) => (plain(s).match(/[█░]/g) ?? []).length;
  assert.equal(barLen(line5h), barLen(line7d));
});

test("renderFrame: shows percentage and projection arrow", () => {
  const out = plain(renderFrame(snap(), { width: 40, now: 0 }));
  assert.match(out, /28% →44%/);
  assert.match(out, /35% →64%/);
});

test("renderFrame: color thresholds green/yellow/red by percentage", () => {
  assert.match(renderFrame(snap({ fiveHourPct: 20 }), { width: 40, now: 0 }), /\x1b\[32m/);
  assert.match(renderFrame(snap({ fiveHourPct: 60 }), { width: 40, now: 0 }), /\x1b\[33m/);
  assert.match(renderFrame(snap({ fiveHourPct: 90 }), { width: 40, now: 0 }), /\x1b\[31m/);
});

test("renderFrame: stale snapshot shows a dim warning", () => {
  assert.match(renderFrame(snap({ stale: true }), { width: 40, now: 0 }), /⚠/);
  assert.doesNotMatch(renderFrame(snap({ stale: false }), { width: 40, now: 0 }), /⚠/);
});

test("renderFrame: reset countdown when resets_at is in the future", () => {
  const now = 1_000_000_000_000;
  const resetAt = now / 1000 + 3 * 3600 + 18 * 60; // +3h18m, in epoch seconds
  const out = plain(renderFrame(snap({ fiveHourResetAt: resetAt }), { width: 40, now }));
  assert.match(out, /⏳3h18m/);
});
