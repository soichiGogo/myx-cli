import fs from "node:fs";
import { usageCachePath } from "./config.ts";
import type { UsageSnapshot } from "./types.ts";

/** Consider the cache stale if not refreshed within this window (Claude idle). */
const STALE_MS = 10 * 60 * 1000;

const EMPTY: UsageSnapshot = {
  fiveHourPct: null,
  fiveHourResetAt: null,
  sevenDayPct: null,
  sevenDayResetAt: null,
  updatedAt: null,
  stale: true,
};

/** Read the official rate-limit snapshot cached by `myx statusline`. */
export function readUsage(): UsageSnapshot {
  try {
    const j = JSON.parse(fs.readFileSync(usageCachePath(), "utf8")) as Partial<UsageSnapshot>;
    const updatedAt = typeof j.updatedAt === "number" ? j.updatedAt : null;
    return {
      fiveHourPct: j.fiveHourPct ?? null,
      fiveHourResetAt: j.fiveHourResetAt ?? null,
      sevenDayPct: j.sevenDayPct ?? null,
      sevenDayResetAt: j.sevenDayResetAt ?? null,
      updatedAt,
      stale: updatedAt == null || Date.now() - updatedAt > STALE_MS,
    };
  } catch {
    return EMPTY;
  }
}
