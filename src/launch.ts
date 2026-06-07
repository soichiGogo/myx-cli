import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";

/**
 * Build the tmux layout and (optionally) attach:
 *
 *   ┌────┬────┬────┬────┐
 *   │work│    │    │    │   four equal columns of shells in the launch dir;
 *   │    │work│work│work│   the leftmost column is split so its bottom holds
 *   ├────┤    │    │    │   the myx widget.
 *   │myx │    │    │    │
 *   └────┴────┴────┴────┘
 */
export function launch(opts: { attach: boolean }): void {
  const cfg = loadConfig();
  const session = cfg.session;
  const cwd = process.cwd();
  const myx = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "myx");

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
    if (opts.attach) tmux(["attach", "-t", session], true);
    else console.log(`tmux session '${session}' already exists.`);
    return;
  }

  // Pane ids (%N) keep the layout robust to pane-base-index settings.
  const col1 = tmuxOut(["new-session", "-d", "-s", session, "-c", cwd, "-P", "-F", "#{pane_id}"]);
  for (let i = 0; i < 3; i++) tmux(["split-window", "-h", "-c", cwd]); // → four columns
  tmux(["select-layout", "-t", session, "even-horizontal"]); // equalize the column widths
  // widget pane at the bottom of the leftmost column
  const widget = tmuxOut([
    "split-window", "-v", "-l", `${cfg.pane.heightPct}%`, "-c", cwd, "-t", col1, "-P", "-F", "#{pane_id}",
  ]);
  tmux(["send-keys", "-t", widget, `${myx} widget`, "Enter"]);
  tmux(["select-pane", "-t", col1]); // focus the top-left work shell

  if (opts.attach) {
    console.log("Tip: run `claude` in any work pane (e.g. the top-left). Detach with Ctrl-b d.");
    tmux(["attach", "-t", session], true);
  } else {
    console.log(`tmux session '${session}' created (detached).`);
  }
}
