import type { MyxConfig } from "./config.ts";
import type { WidgetState } from "./types.ts";

const ESC = "\x1b";

/** Wrap a label in an OSC 8 hyperlink (clickable via ⌘+click in Ghostty). */
export function osc8(label: string, url: string): string {
  return `${ESC}]8;;${url}${ESC}\\${label}${ESC}]8;;${ESC}\\`;
}

/** A fixed-width filled/empty block bar from a 0..1 fraction. */
function bar(pct: number, width = 9): string {
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

/** Render the widget body as a multi-line string (no screen clearing). */
export function renderFrame(state: WidgetState, cfg: MyxConfig): string {
  const now = Date.now();
  const lines: string[] = [];

  const events = state.events.slice(0, cfg.events);
  for (const e of events) {
    const head = `🗓 ${hhmm(e.start)} ${e.title}`;
    const left = (e.start.getTime() - now) / 60000;
    const join = e.meetingUrl ? " " + osc8("▶Join", e.meetingUrl) : "";
    lines.push(`${head}  ${dur(left)}${join}`);
  }
  while (lines.length < cfg.events) lines.push("🗓 —");

  const width = Math.max(16, Math.min(process.stdout.columns ?? 26, 40));
  lines.push("─".repeat(width));

  const u = state.usage;
  if (u.pct != null) {
    const tilde = u.estimated ? "~" : "";
    lines.push(`5h ${bar(u.pct)} ${tilde}${Math.round(u.pct * 100)}%  ⟳${dur(u.resetInMinutes)}`);
  } else {
    lines.push(`5h ${bar(0)} --%  ⟳${dur(u.resetInMinutes)}`);
  }

  if (u.projectedPct != null) {
    if (u.projectedPct > 1 && u.minutesToLimit != null) {
      lines.push(`→ 上限まで ~${dur(u.minutesToLimit)} ⚠`);
    } else {
      lines.push(`→ このペースで reset時 ${Math.round(u.projectedPct * 100)}%`);
    }
  }

  if (state.stale) lines.push("⚠ stale");

  return lines.join("\n");
}
