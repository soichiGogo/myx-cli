import { execFileSync } from "node:child_process";
import { loadConfig, myxBin, type MyxConfig } from "./config.ts";
import { canvasLaunchArrange } from "./canvas.ts";

/**
 * Build the tmux layout and attach. `myx launch` / `myx canvas` always rebuild a
 * fresh session (kill any existing one first) — they never reuse a stale layout.
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
 * `--canvas` (macOS) — the left half of the screen is tmux: `canvas.cols` work columns
 * (default 2) with the myx widget at the bottom of the leftmost one; the right half is a
 * real GUI window that `myx show` drives:
 *
 *   ┌─────┬─────┐  ┌──────────────┐
 *   │work │work │  │              │
 *   │(cc) │(cc) │  │  canvas      │  ← real browser / app window,
 *   ├─────┤     │  │ (myx show …) │    tiled to the right half
 *   │ myx │     │  │              │
 *   └─────┴─────┘  └──────────────┘
 *      Ghostty        separate GUI window
 */
const TMUX = (args: string[], inherit = false): void => {
  execFileSync("tmux", args, inherit ? { stdio: "inherit" } : { encoding: "utf8" });
};
const TMUX_OUT = (args: string[]): string =>
  execFileSync("tmux", args, { encoding: "utf8" }).trim();

function sessionExists(name: string): boolean {
  try {
    execFileSync("tmux", ["has-session", "-t", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The tmux session this process is running inside, or null when not in tmux. */
function currentSession(): string | null {
  if (!process.env.TMUX) return null;
  try {
    return TMUX_OUT(["display-message", "-p", "#{session_name}"]);
  } catch {
    return null;
  }
}

function tip(canvas?: boolean): void {
  console.log(
    canvas
      ? "Tip: run `claude` top-left; show it on the right with `myx show <file|url>`. Detach with Ctrl-b d."
      : "Tip: run `claude` in any work pane (e.g. the top-left). Detach with Ctrl-b d.",
  );
}

/**
 * Build a fresh *detached* session `name` with the work/widget layout. The session
 * is built at the launching terminal's size so it barely rescales when a client
 * attaches; pane ids (%N) keep the layout robust to pane-base-index settings.
 */
function buildLayout(name: string, cfg: MyxConfig, canvas?: boolean): void {
  const cwd = process.cwd();
  const myx = myxBin();
  const cols = Number(process.stdout.columns) || 200;
  const rows = Number(process.stdout.rows) || 50;
  const col1 = TMUX_OUT([
    "new-session",
    "-d",
    "-s",
    name,
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
  // Column count: default layout is four equal columns; --canvas fills only the left
  // half of the screen (the right half is a separate GUI window, not a tmux pane), so
  // it uses `canvas.cols` work columns there (default 2). The widget always lands at
  // the bottom of the leftmost column below.
  const ncols = canvas ? Math.max(1, cfg.canvas.cols) : 4;
  for (let i = 0; i < ncols - 1; i++) TMUX(["split-window", "-h", "-t", name, "-c", cwd]);
  if (ncols > 1) TMUX(["select-layout", "-t", name, "even-horizontal"]); // equalize the column widths
  // widget pane at the bottom of the leftmost column, sized in absolute rows.
  // The widget is fixed-height content, so resolve a percentage to lines up front:
  // a percentage-built pane does NOT survive tmux's lossy proportional rescale when
  // the client attaches at a different size than the build (it can collapse to 1–2
  // rows — exactly what happens in --canvas, where Ghostty is tiled/un-fullscreened
  // between build and attach). Absolute rows + a re-pin hook keep it stable.
  const lines = cfg.pane.heightLines ?? Math.max(2, Math.round((cfg.pane.heightPct / 100) * rows));
  const widget = TMUX_OUT([
    "split-window",
    "-v",
    "-l",
    String(lines),
    "-c",
    cwd,
    "-t",
    col1,
    "-P",
    "-F",
    "#{pane_id}",
  ]);
  TMUX(["send-keys", "-t", widget, `${myx} widget`, "Enter"]);
  TMUX(["select-pane", "-t", col1]); // focus the top-left work shell

  // Re-pin the widget height whenever a client attaches or the window is resized,
  // so tmux's proportional rescale can't squeeze it down to a sliver.
  const pin = `resize-pane -t ${widget} -y ${lines}`;
  TMUX(["set-hook", "-t", name, "client-attached", pin]);
  TMUX(["set-hook", "-t", name, "window-resized", pin]);
}

/**
 * `myx canvas` — the `--canvas` layout. Always a fresh rebuild (same as
 * `myx launch --canvas`); see `launch` for how the in-place vs. outside cases are
 * handled.
 */
export function canvasCommand(session?: string): void {
  launch({ attach: true, canvas: true, session });
}

/**
 * Build a fresh session and attach. Any existing session of the same name is killed
 * first — `launch` never reuses a stale layout.
 *
 * Three cases for the kill:
 *  - **outside the target session** (not in tmux, or in a different session): kill
 *    the old one and build + attach (or `switch-client` when nested in another tmux).
 *  - **inside the target session**: a plain kill would also kill *this* process before
 *    it could rebuild, so rename the old session aside, build the fresh one, switch the
 *    client to it, then kill the old (last op — the now-detached pane running us dies
 *    with it). The old session (and anything running in it, e.g. claude) is gone, as
 *    intended; the same Ghostty ends up on the fresh session.
 *  - **--no-attach** (scripted/test build): just (re)build detached, no window arrange.
 */
export function launch(opts: { attach: boolean; canvas?: boolean; session?: string }): void {
  const cfg = loadConfig();
  const session = opts.session ?? cfg.session;
  const cur = currentSession();
  const insideTarget = cur === session;

  if (!opts.attach) {
    if (insideTarget) {
      console.error(
        `myx: refusing to rebuild '${session}' detached from inside it ` +
          `(that would kill this session without anything to attach to).`,
      );
      process.exit(1);
    }
    if (sessionExists(session)) TMUX(["kill-session", "-t", session]);
    buildLayout(session, cfg, opts.canvas);
    console.log(`tmux session '${session}' created (detached).`);
    return;
  }

  if (insideTarget) {
    const old = `${session}-old`;
    if (sessionExists(old)) TMUX(["kill-session", "-t", old]);
    TMUX(["rename-session", "-t", session, old]); // move the live session aside
    buildLayout(session, cfg, opts.canvas);
    if (opts.canvas) canvasLaunchArrange(cfg);
    tip(opts.canvas);
    TMUX(["switch-client", "-t", session]); // this Ghostty → the fresh session
    TMUX(["kill-session", "-t", old]); // last: also ends the pane running us
    return;
  }

  if (sessionExists(session)) TMUX(["kill-session", "-t", session]);
  buildLayout(session, cfg, opts.canvas);
  if (opts.canvas) canvasLaunchArrange(cfg);
  tip(opts.canvas);
  if (cur)
    TMUX(["switch-client", "-t", session], true); // nested in another tmux: can't attach
  else TMUX(["attach", "-t", session], true);
}
