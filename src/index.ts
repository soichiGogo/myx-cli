import { loadConfig } from "./config.ts";
import { renderFrame } from "./render.ts";
import { readUsage } from "./usage.ts";
import type { CalEvent, WidgetState } from "./types.ts";

/** Placeholder events until the iCal calendar lands in Phase 3. */
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

function currentState(): WidgetState {
  // Usage is the official rate-limit snapshot cached by `myx statusline`.
  return { events: placeholderEvents(), usage: readUsage() };
}

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_HOME = "\x1b[H\x1b[2J";

export async function runWidget(opts: { once: boolean }): Promise<void> {
  const cfg = loadConfig();

  if (opts.once) {
    process.stdout.write(renderFrame(currentState(), cfg) + "\n");
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
    process.stdout.write(CLEAR_HOME + renderFrame(currentState(), cfg));
    await new Promise((r) => setTimeout(r, 1000));
  }
}
