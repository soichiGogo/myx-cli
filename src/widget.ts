import { renderFrame } from "./render.ts";
import { readUsage } from "./usage.ts";
import { clearHome, cursor } from "./ansi.ts";

/**
 * Run the widget: either render a single frame (`--once`) or loop, redrawing the
 * usage bars once a second so the bars and countdowns stay live.
 */
export async function runWidget(opts: { once: boolean }): Promise<void> {
  if (opts.once) {
    process.stdout.write(renderFrame(readUsage()) + "\n");
    return;
  }

  process.stdout.write(cursor.hide);
  const cleanup = (): never => {
    process.stdout.write(cursor.show);
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  for (;;) {
    process.stdout.write(clearHome + renderFrame(readUsage()));
    await new Promise((r) => setTimeout(r, 1000));
  }
}
