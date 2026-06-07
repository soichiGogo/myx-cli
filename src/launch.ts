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
export function launch(opts: { attach: boolean; fresh: boolean }): void {
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

  if (opts.fresh && sessionExists()) tmux(["kill-session", "-t", session]);
  if (sessionExists()) {
    // An existing session is reused as-is; rebuild with --fresh to apply layout/config changes.
    if (opts.attach) {
      console.log(`Attaching to existing '${session}' (use \`myx launch --fresh\` to rebuild).`);
      tmux(["attach", "-t", session], true);
    } else {
      console.log(`tmux session '${session}' already exists — use \`--fresh\` to rebuild.`);
    }
    return;
  }

  // Build the detached session at the launching terminal's size so it barely
  // rescales when the client attaches. Pane ids (%N) keep the layout robust to
  // pane-base-index settings.
  const cols = Number(process.stdout.columns) || 200;
  const rows = Number(process.stdout.rows) || 50;
  const col1 = tmuxOut([
    "new-session",
    "-d",
    "-s",
    session,
    "-c",
    cwd,
    "-x",
    String(cols),
    "-y",
    String(rows),
    "-P",
    "-F",
    "#{pane_id}",
  ]);
  for (let i = 0; i < 3; i++) tmux(["split-window", "-h", "-c", cwd]); // → four columns
  tmux(["select-layout", "-t", session, "even-horizontal"]); // equalize the column widths
  // widget pane at the bottom of the leftmost column.
  // -l takes absolute rows (heightLines) or a percentage of the column.
  const paneSize =
    cfg.pane.heightLines != null ? `${cfg.pane.heightLines}` : `${cfg.pane.heightPct}%`;
  const widget = tmuxOut([
    "split-window",
    "-v",
    "-l",
    paneSize,
    "-c",
    cwd,
    "-t",
    col1,
    "-P",
    "-F",
    "#{pane_id}",
  ]);
  tmux(["send-keys", "-t", widget, `${myx} widget`, "Enter"]);
  tmux(["select-pane", "-t", col1]); // focus the top-left work shell

  // An absolute height doesn't survive tmux's proportional rescale when the client
  // attaches and the window grows. Re-pin the myx pane height on attach/resize.
  if (cfg.pane.heightLines != null) {
    const pin = `resize-pane -t ${widget} -y ${cfg.pane.heightLines}`;
    tmux(["set-hook", "-t", session, "client-attached", pin]);
    tmux(["set-hook", "-t", session, "window-resized", pin]);
  }

  if (opts.attach) {
    console.log("Tip: run `claude` in any work pane (e.g. the top-left). Detach with Ctrl-b d.");
    tmux(["attach", "-t", session], true);
  } else {
    console.log(`tmux session '${session}' created (detached).`);
  }
}
