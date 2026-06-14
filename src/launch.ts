import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";
import { canvasLaunchArrange } from "./canvas.ts";

/**
 * Build the tmux layout and (optionally) attach.
 *
 * Default — four equal columns of shells in the launch dir; the leftmost column
 * is split so its bottom holds the myx widget:
 *
 *   ┌────┬────┬────┬────┐
 *   │work│    │    │    │
 *   │    │work│work│work│
 *   ├────┤    │    │    │
 *   │myx │    │    │    │
 *   └────┴────┴────┴────┘
 *
 * `--canvas` (macOS) — a single left column (work above, myx widget below); the
 * right half of the screen is a real GUI window that `myx show` drives:
 *
 *   ┌────────┐  ┌──────────────┐
 *   │ work   │  │              │
 *   │(claude)│  │  canvas      │  ← real browser / app window,
 *   ├────────┤  │ (myx show …) │    tiled to the right half
 *   │ myx    │  │              │
 *   └────────┘  └──────────────┘
 *     Ghostty       separate GUI window
 */
const TMUX = (args: string[], inherit = false): void => {
  execFileSync("tmux", args, inherit ? { stdio: "inherit" } : { encoding: "utf8" });
};
const TMUX_OUT = (args: string[]): string =>
  execFileSync("tmux", args, { encoding: "utf8" }).trim();
function myxBin(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "myx");
}

/**
 * Reshape the *current* tmux window into the canvas left column — keep the pane we're
 * running in (claude) as the work pane on top, drop the other panes in this window,
 * and put the myx widget back at the bottom. This is what `myx canvas` runs so an
 * already-attached session collapses into the work+widget split without `--fresh`.
 *
 * Only the panes of the current window are touched (siblings are closed); the session
 * itself is never killed — claude keeps running in its own pane.
 */
export function reshapeToCanvasWindow(): void {
  const cur = process.env.TMUX_PANE;
  if (!process.env.TMUX || !cur) {
    console.log(
      "myx canvas: not inside tmux — skipping the work+widget split " +
        "(use `myx launch --canvas` for the full layout).",
    );
    return;
  }
  const cfg = loadConfig();
  const cwd = process.cwd();
  const myx = myxBin();
  const session = TMUX_OUT(["display-message", "-p", "-t", cur, "#{session_name}"]);

  // Collapse to a single work pane: close every other pane in this window. `-a`
  // kills all panes in the window except the target (the claude pane stays).
  const paneCount = Number(TMUX_OUT(["display-message", "-p", "-t", cur, "#{window_panes}"]));
  if (paneCount > 1) TMUX(["kill-pane", "-a", "-t", cur]);

  // Re-add the widget pane at the bottom of the (now single) column.
  const paneSize =
    cfg.pane.heightLines != null ? `${cfg.pane.heightLines}` : `${cfg.pane.heightPct}%`;
  const widget = TMUX_OUT([
    "split-window",
    "-v",
    "-l",
    paneSize,
    "-c",
    cwd,
    "-t",
    cur,
    "-P",
    "-F",
    "#{pane_id}",
  ]);
  TMUX(["send-keys", "-t", widget, `${myx} widget`, "Enter"]);
  TMUX(["select-pane", "-t", cur]); // keep focus on the work (claude) pane

  // Keep the absolute widget height pinned across attach/resize, like `launch` does.
  if (cfg.pane.heightLines != null) {
    const pin = `resize-pane -t ${widget} -y ${cfg.pane.heightLines}`;
    TMUX(["set-hook", "-t", session, "client-attached", pin]);
    TMUX(["set-hook", "-t", session, "window-resized", pin]);
  }
}

export function launch(opts: { attach: boolean; fresh: boolean; canvas?: boolean }): void {
  const cfg = loadConfig();
  const session = cfg.session;
  const cwd = process.cwd();
  const myx = myxBin();
  const tmux = TMUX;
  const tmuxOut = TMUX_OUT;

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
  // Default layout adds three more columns; --canvas keeps a single left column
  // (the right half of the screen is a separate GUI window, not a tmux pane).
  if (!opts.canvas) {
    for (let i = 0; i < 3; i++) tmux(["split-window", "-h", "-c", cwd]); // → four columns
    tmux(["select-layout", "-t", session, "even-horizontal"]); // equalize the column widths
  }
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

  // Canvas layout: tile Ghostty left and open the right-hand canvas window.
  // Done before attach (which blocks) so the windows are arranged up front.
  // Skipped on --no-attach: that's the scripted/test build, with no client to
  // arrange windows for.
  if (opts.canvas && opts.attach) canvasLaunchArrange(cfg);

  if (opts.attach) {
    console.log(
      opts.canvas
        ? "Tip: run `claude` top-left; show it on the right with `myx show <file|url>`. Detach with Ctrl-b d."
        : "Tip: run `claude` in any work pane (e.g. the top-left). Detach with Ctrl-b d.",
    );
    tmux(["attach", "-t", session], true);
  } else {
    console.log(`tmux session '${session}' created (detached).`);
  }
}
