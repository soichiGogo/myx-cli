import type { MyxConfig } from "./config.ts";
import type { WidgetState } from "./types.ts";

const ESC = "\x1b";

/** Wrap a label in an OSC 8 hyperlink (clickable via ⌘+click in Ghostty). */
export function osc8(label: string, url: string): string {
  return `${ESC}]8;;${url}${ESC}\\${label}${ESC}]8;;${ESC}\\`;
}

/** Approximate visible width in terminal cells (emoji / CJK counted as 2). */
function vis(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const wide =
      cp >= 0x1f000 ||
      cp === 0x231b ||
      (cp >= 0x23e9 && cp <= 0x23fa) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xff00 && cp <= 0xff60);
    n += wide ? 2 : 1;
  }
  return n;
}

/** Truncate to a max visible width, adding an ellipsis when cut. */
function truncate(s: string, max: number): string {
  if (max <= 0) return "";
  if (vis(s) <= max) return s;
  let out = "";
  let acc = 0;
  for (const ch of s) {
    const cw = vis(ch);
    if (acc + cw > max - 1) break; // leave a cell for the ellipsis
    out += ch;
    acc += cw;
  }
  return out + "…";
}

/** left + right, right-aligned within width W (>= 1 cell gap). */
function spread(left: string, leftVis: number, right: string, rightVis: number, W: number): string {
  const gap = Math.max(1, W - leftVis - rightVis);
  return left + " ".repeat(gap) + right;
}

function bar(pct: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(pct * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** Compact duration: 23m, 4h, 3h18m. */
function dur(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h${rem}m` : `${h}h`;
}

function hhmm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
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

/** Render the widget body as a multi-line string sized to the pane (no wrapping). */
export function renderFrame(state: WidgetState, cfg: MyxConfig): string {
  const W = termWidth();
  const now = Date.now();
  const lines: string[] = [];

  const events = state.events.slice(0, cfg.events);
  const fullJoin = W >= 30;
  const joinLabel = fullJoin ? "▶Join" : "▶";
  const joinVis = fullJoin ? 1 + 5 : 1 + 1; // leading space + label width

  const LEAD = 9; // "🗓 HH:MM " => 2+1 + 5+1
  for (const e of events) {
    const lead = `🗓 ${hhmm(e.start)} `;
    const durStr = dur((e.start.getTime() - now) / 60000);
    const rightVis = vis(durStr) + (e.meetingUrl ? joinVis : 0);
    const title = truncate(e.title, W - LEAD - rightVis - 1);
    const right = durStr + (e.meetingUrl ? " " + osc8(joinLabel, e.meetingUrl) : "");
    lines.push(spread(lead + title, LEAD + vis(title), right, rightVis, W));
  }
  while (lines.length < cfg.events) lines.push("🗓 —");

  lines.push("─".repeat(W));

  const u = state.usage;
  const reset5h = minutesUntil(u.fiveHourResetAt, now);
  let resetStr = reset5h != null ? `  ⏳${dur(reset5h)}` : "";
  // fixed cells around the bar: "5h "(3) + sp(1) + pct(<=4) + " →NNN%"(<=6) + margin(1) = 15
  let barW = W - 15 - vis(resetStr);
  if (barW < 5 && resetStr) {
    resetStr = "";
    barW = W - 15;
  }
  barW = Math.max(4, Math.min(12, barW));
  lines.push(usageLine("5h", u.fiveHourPct, u.projectedFiveHourPct, barW, resetStr));
  lines.push(usageLine("7d", u.sevenDayPct, u.projectedSevenDayPct, barW, u.stale ? "  " + dim("⚠") : ""));

  return lines.join("\n");
}
