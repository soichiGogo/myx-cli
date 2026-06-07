import type { UsageSnapshot } from "./types.ts";

const ESC = "\x1b";

/** Approximate visible width in terminal cells (emoji counted as 2). */
function vis(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    n += cp >= 0x1f000 || cp === 0x231b || (cp >= 0x23e9 && cp <= 0x23fa) ? 2 : 1;
  }
  return n;
}

function bar(pct: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** Compact duration: 23m, 4h, 3h18m, 5d3h. */
function dur(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h${rem}m` : `${h}h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return h ? `${d}d${h}h` : `${d}d`;
}

function colorByPct(s: string, pct: number): string {
  const code = pct < 50 ? 32 : pct < 80 ? 33 : 31; // green / yellow / red
  return `${ESC}[${code}m${s}${ESC}[0m`;
}

function dim(s: string): string {
  return `${ESC}[2m${s}${ESC}[0m`;
}

function minutesUntil(epochSeconds: number | null, nowMs: number): number | null {
  return epochSeconds == null ? null : (epochSeconds * 1000 - nowMs) / 60000;
}

/** `  ⏳3h18m` reset-countdown tail, or "" when unknown. */
function resetTail(resetAt: number | null, nowMs: number): string {
  const m = minutesUntil(resetAt, nowMs);
  return m != null ? `  ⏳${dur(m)}` : "";
}

/** `5h ██████░░ 68% →94%` + tail — colored bar + projection. barW is shared so the bars align. */
function usageLine(label: string, pct: number | null, proj: number | null, barW: number, tail: string): string {
  const pctStr = pct != null ? `${Math.round(pct)}%` : "--%";
  const b = bar((pct ?? 0) / 100, barW);
  const body = pct != null ? colorByPct(`${b} ${pctStr}`, pct) : `${b} ${pctStr}`;
  const projStr = proj != null ? " " + colorByPct(`→${Math.round(proj)}%`, proj) : "";
  return `${label} ${body}${projStr}${tail}`;
}

/** Pane width, clamped to a tidy range. */
function termWidth(): number {
  const raw = process.stdout.columns ?? Number(process.env.COLUMNS);
  const c = Number.isFinite(raw) ? (raw as number) : 28;
  return Math.max(16, Math.min(c, 44));
}

/** Render the two usage bars (5h + 7d) sized to the pane. */
export function renderFrame(u: UsageSnapshot): string {
  const W = termWidth();
  const now = Date.now();

  let reset5h = resetTail(u.fiveHourResetAt, now);
  let reset7d = resetTail(u.sevenDayResetAt, now);
  // fixed cells around the bar: "5h "(3) + sp(1) + pct(<=4) + " →NNN%"(<=6) + margin(1) = 15
  let barW = W - 15 - Math.max(vis(reset5h), vis(reset7d));
  if (barW < 5) {
    reset5h = "";
    reset7d = "";
    barW = W - 15;
  }
  barW = Math.max(4, Math.min(12, barW));
  const stale = u.stale ? "  " + dim("⚠") : "";

  return [
    usageLine("5h", u.fiveHourPct, u.projectedFiveHourPct, barW, reset5h),
    usageLine("7d", u.sevenDayPct, u.projectedSevenDayPct, barW, reset7d + stale),
  ].join("\n");
}
