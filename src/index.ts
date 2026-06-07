import { loadConfig } from "./config.ts";
import { renderFrame } from "./render.ts";
import { readUsage } from "./usage.ts";
import { fetchEvents } from "./calendar.ts";
import type { CalEvent } from "./types.ts";

/** Demo events shown only when no iCal URL is configured. */
function placeholderEvents(): CalEvent[] {
  const now = Date.now();
  return [
    {
      start: new Date(now + 23 * 60000),
      title: "Standup",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    },
    { start: new Date(now + 4 * 60 * 60000), title: "1on1" },
  ];
}

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_HOME = "\x1b[H\x1b[2J";

export async function runWidget(opts: { once: boolean }): Promise<void> {
  const cfg = loadConfig();

  let events: CalEvent[] = cfg.icalUrl ? [] : placeholderEvents();
  let lastCalFetch = 0;
  let fetching = false;

  async function refreshCalendar(): Promise<void> {
    if (!cfg.icalUrl || fetching) return;
    const now = Date.now();
    if (lastCalFetch && now - lastCalFetch < cfg.refresh.calendarSec * 1000) return;
    fetching = true;
    lastCalFetch = now;
    try {
      events = await fetchEvents(cfg.icalUrl, cfg.events, new Date());
    } catch {
      /* keep the last good events on a fetch error */
    } finally {
      fetching = false;
    }
  }

  const frame = (): string => renderFrame({ events, usage: readUsage() }, cfg);

  if (opts.once) {
    await refreshCalendar();
    process.stdout.write(frame() + "\n");
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
    void refreshCalendar(); // self-throttled; updates `events` when it resolves
    process.stdout.write(CLEAR_HOME + frame());
    await new Promise((r) => setTimeout(r, 1000));
  }
}
