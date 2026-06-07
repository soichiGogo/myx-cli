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
  const barW = Math.max(6, Math.min(12, W - 12));
  const tilde = u.estimated ? "~" : "";
  lines.push(u.pct != null ? `5h ${bar(u.pct, barW)} ${tilde}${Math.round(u.pct * 100)}%` : `5h ${bar(0, barW)} --%`);

  if (u.projectedPct != null && u.projectedPct > 1 && u.minutesToLimit != null) {
    // On pace to hit the cap before reset — the urgent case.
    lines.push(`🔥 LIMIT ${dur(u.minutesToLimit)} ⚠`);
  } else {
    const left = `⏳ ${dur(u.resetInMinutes)}`;
    const leftVis = 3 + vis(dur(u.resetInMinutes));
    const pct = u.projectedPct != null ? Math.round(u.projectedPct * 100) : null;
    let proj = pct != null ? `${pct}% proj` : "--";
    if (pct != null && W - leftVis - (3 + vis(proj)) < 1) proj = `${pct}%`; // drop "proj" when tight
    lines.push(spread(left, leftVis, `🔥 ${proj}`, 3 + vis(proj), W));
  }

  if (state.stale) lines.push("⚠ stale");
  return lines.join("\n");
}
