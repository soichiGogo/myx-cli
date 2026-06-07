import { renderFrame } from "./render.ts";
import { readUsage } from "./usage.ts";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_HOME = "\x1b[H\x1b[2J";

export async function runWidget(opts: { once: boolean }): Promise<void> {
  if (opts.once) {
    process.stdout.write(renderFrame(readUsage()) + "\n");
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
    process.stdout.write(CLEAR_HOME + renderFrame(readUsage()));
    await new Promise((r) => setTimeout(r, 1000));
  }
}
