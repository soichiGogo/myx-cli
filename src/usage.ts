import fs from "node:fs";
import { usageCachePath } from "./config.ts";
import type { UsageSnapshot } from "./types.ts";

/** Consider the cache stale if not refreshed within this window (Claude idle). */
const STALE_MS = 10 * 60 * 1000;

const FIVE_HOUR_SEC = 5 * 3600;
const SEVEN_DAY_SEC = 7 * 24 * 3600;

const EMPTY: UsageSnapshot = {
  fiveHourPct: null,
  fiveHourResetAt: null,
  sevenDayPct: null,
  sevenDayResetAt: null,
  projectedFiveHourPct: null,
  projectedSevenDayPct: null,
  updatedAt: null,
  stale: true,
};

/**
 * Projected usage at the window's reset, assuming the average pace so far in the
 * window continues: `currentPct / fractionOfWindowElapsed`. Returns null when too
 * early in the window to be meaningful. May exceed 100 (on pace to hit the cap).
 */
export function project(
  pct: number | null,
  resetAt: number | null,
  windowSec: number,
  nowMs: number,
): number | null {
  if (pct == null || resetAt == null) return null;
  const windowStart = resetAt - windowSec; // epoch seconds
  const frac = (nowMs / 1000 - windowStart) / windowSec;
  if (frac < 0.05 || frac > 1) return null;
  return Math.min(999, pct / frac);
}

/** Read the official rate-limit snapshot cached by `myx statusline`. */
export function readUsage(): UsageSnapshot {
  try {
    const j = JSON.parse(fs.readFileSync(usageCachePath(), "utf8")) as Partial<UsageSnapshot>;
    const now = Date.now();
    const updatedAt = typeof j.updatedAt === "number" ? j.updatedAt : null;
    const fiveHourPct = j.fiveHourPct ?? null;
    const fiveHourResetAt = j.fiveHourResetAt ?? null;
    const sevenDayPct = j.sevenDayPct ?? null;
    const sevenDayResetAt = j.sevenDayResetAt ?? null;
    return {
      fiveHourPct,
      fiveHourResetAt,
      sevenDayPct,
      sevenDayResetAt,
      projectedFiveHourPct: project(fiveHourPct, fiveHourResetAt, FIVE_HOUR_SEC, now),
      projectedSevenDayPct: project(sevenDayPct, sevenDayResetAt, SEVEN_DAY_SEC, now),
      updatedAt,
      stale: updatedAt == null || now - updatedAt > STALE_MS,
    };
  } catch {
    return EMPTY;
  }
}
