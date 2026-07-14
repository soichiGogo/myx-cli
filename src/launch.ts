import { execFileSync } from "node:child_process";
import { loadConfig, myxBin, type MyxConfig } from "./config.ts";
import { canvasLaunchArrange } from "./canvas.ts";

/**
 * Build the tmux layout and attach. `myx launch` / `myx canvas` never kill an existing
 * session — each run starts a *new* session, auto-numbering the name (`myx`, `myx-2`,
 * `myx-3`, … via `nextSessionName`) so earlier sessions keep running. List and remove
 * them with `myx sessions` / `myx kill` (see `sessions.ts`).
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

/**
 * First free name in the `base`, `base-2`, `base-3`, … series (per `exists`). `launch`
 * never kills or reuses a session, so when the preferred name is already taken the run
 * gets the next number instead and earlier sessions stay untouched.
 */
export function nextSessionName(base: string, exists: (name: string) => boolean): string {
  if (!exists(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const name = `${base}-${i}`;
    if (!exists(name)) return name;
  }
  throw new Error(`myx: too many '${base}-*' sessions — kill some with 'myx sessions'`);
}

/** The tmux session this process is running inside, or null when not in tmux. */
export function currentSession(): string | null {
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
 * `myx canvas` — the `--canvas` layout. Same as `myx launch --canvas`: builds a *new*
 * session (never kills an existing one); see `launch`.
 */
export function canvasCommand(session?: string): void {
  launch({ attach: true, canvas: true, session });
}

/**
 * Build a *new* session and attach — `launch` never kills or reuses an existing one.
 * The preferred name is `--session` (or config `session`, default "myx"); if it is
 * already taken, `nextSessionName` picks the next free `-N` so earlier sessions keep
 * running (remove them with `myx sessions` / `myx kill`).
 *
 *  - **--no-attach** (scripted/test build): build the new session detached and print its
 *    name, no window arrange.
 *  - **attach, nested in another tmux**: `switch-client` this client to the new session.
 *  - **attach, not in tmux**: `attach` to the new session.
 *
 * Run from inside an existing myx session, that session is left running; this client
 * just switches to the freshly built one.
 */
export function launch(opts: { attach: boolean; canvas?: boolean; session?: string }): void {
  const cfg = loadConfig();
  const session = nextSessionName(opts.session ?? cfg.session, sessionExists);
  const cur = currentSession();

  buildLayout(session, cfg, opts.canvas);

  if (!opts.attach) {
    console.log(`tmux session '${session}' created (detached).`);
    return;
  }

  if (opts.canvas) canvasLaunchArrange(cfg);
  tip(opts.canvas);
  if (cur)
    TMUX(["switch-client", "-t", session], true); // nested in another tmux: can't attach
  else TMUX(["attach", "-t", session], true);
}
