import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";

/**
 * Build the tmux layout and (optionally) attach:
 *
 *   ┌───────────────────────────┐
 *   │ main (pane 0.0) — claude   │
 *   ├──────────────┬────────────┤
 *   │ widget 0.1   │ shell 0.2  │   <- bottom strip (heightPct), widget = leftWidthPct
 *   └──────────────┴────────────┘
 */
export function launch(opts: { attach: boolean }): void {
  const cfg = loadConfig();
  const session = cfg.session;
  const here = path.dirname(fileURLToPath(import.meta.url)); // src/
  const myx = path.join(here, "..", "bin", "myx");

  const tmux = (args: string[], inherit = false): void => {
    execFileSync("tmux", args, inherit ? { stdio: "inherit" } : { encoding: "utf8" });
  };
  const tmuxOut = (args: string[]): string =>
    execFileSync("tmux", args, { encoding: "utf8" }).trim();

  const sessionExists = (): boolean => {
    try {
      execFileSync("tmux", ["has-session", "-t", session], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };

  if (sessionExists()) {
    if (opts.attach) {
      tmux(["attach", "-t", session], true);
    } else {
      console.log(`tmux session '${session}' already exists.`);
    }
    return;
  }

  // Use pane ids (%N) so the layout is robust to pane-base-index settings.
  const mainId = tmuxOut(["new-session", "-d", "-s", session, "-P", "-F", "#{pane_id}"]);
  // carve the bottom strip; the widget keeps this (left) pane
  const widgetId = tmuxOut([
    "split-window", "-v", "-l", `${cfg.pane.heightPct}%`, "-t", mainId, "-P", "-F", "#{pane_id}",
  ]);
  // split the bottom strip: shell on the right, widget stays on the left
  tmux(["split-window", "-h", "-l", `${100 - cfg.pane.leftWidthPct}%`, "-t", widgetId]);
  // run the widget in the bottom-left pane
  tmux(["send-keys", "-t", widgetId, `${myx} widget`, "Enter"]);
  // focus the main pane for claude
  tmux(["select-pane", "-t", mainId]);

  if (opts.attach) {
    console.log("Tip: run `claude` in the main pane. Detach with Ctrl-b d.");
    tmux(["attach", "-t", session], true);
  } else {
    console.log(`tmux session '${session}' created (detached).`);
  }
}
