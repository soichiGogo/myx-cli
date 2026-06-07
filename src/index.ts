import { loadConfig } from "./config.ts";
import { renderFrame } from "./render.ts";
import type { CalEvent, UsageSnapshot, WidgetState } from "./types.ts";

/**
 * Phase 1 placeholder state. Real usage (ccusage) lands in Phase 2 and real
 * calendar (iCal) in Phase 3; for now we render the final layout with dummy
 * data whose countdowns tick so the loop is visibly live.
 */
function placeholderState(blockEnd: Date): WidgetState {
  const now = new Date();
  const events: CalEvent[] = [
    {
      start: new Date(now.getTime() + 23 * 60000),
      title: "Standup",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    },
    { start: new Date(now.getTime() + 4 * 60 * 60000), title: "1on1" },
  ];

  const usage: UsageSnapshot = {
    pct: 0.68,
    projectedPct: 0.97,
    resetInMinutes: (blockEnd.getTime() - now.getTime()) / 60000,
    estimated: true,
  };

  return { events, usage };
}

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_HOME = "\x1b[H\x1b[2J";

export async function runWidget(opts: { once: boolean }): Promise<void> {
  const cfg = loadConfig();
  const blockEnd = new Date(Date.now() + 198 * 60000); // fixed anchor so ⟳ ticks down

  if (opts.once) {
    process.stdout.write(renderFrame(placeholderState(blockEnd), cfg) + "\n");
    return;
  }

  process.stdout.write(HIDE_CURSOR);
  const cleanup = (): never => {
    process.stdout.write(SHOW_CURSOR);
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    process.stdout.write(CLEAR_HOME + renderFrame(placeholderState(blockEnd), cfg));
    await new Promise((r) => setTimeout(r, 1000));
  }
}
