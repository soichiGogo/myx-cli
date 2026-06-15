# CLAUDE.md — myx-cli

Guidance for working in this repo. Keep it consistent with the locked design below.

## What this is

A TypeScript/Node **CLI tool** (`myx <command>`) that renders a small always-on
widget in the **bottom-left tmux pane** while the user runs `claude` in **Ghostty**.

The intent is a personal dashboard for whatever the user wants permanently visible in
the bottom-left — **items are expected to be added over time**. Today it shows one
thing: **official Claude usage** (5-hour and weekly rate-limit bars with reset
countdowns and a projection). New items should slot in alongside it, not replace it.

## Locked design decisions (and why)

- **Layout = tmux.** Ghostty exposes no IPC to place a process in a given split
  (no `kitten @` / `wezterm cli` equivalent — verified). So the layout is built by
  tmux: `myx launch` opens four equal columns of shells in the launch dir (`-c $PWD`);
  the leftmost column is split so its bottom runs the widget. See `src/launch.ts`.
- **Usage = official rate limits via statusLine (δ).** Claude Code passes
  `rate_limits.five_hour.{used_percentage,resets_at}` and `.seven_day.{…}` to its
  `statusLine` command on stdin (documented). `myx statusline` caches that payload to
  `~/.cache/myx/usage.json`; the widget reads it (`src/usage.ts`). The % is the
  _official_ number — no auth, no calibration, no ccusage. `myx install-statusline`
  wires it up and **chains** any existing statusLine (saved as `statuslinePassthrough`)
  so the user's own bar is preserved. (The rate-limit headers are _not_ persisted to
  disk, so the statusLine stdin payload is the supported source — don't re-litigate.)
- **Usage display = two colored bars** like Claude Code's `/usage`:
  `5h <bar> NN% →MM% ⏳<reset>` and `7d <bar> NN% →MM%`. Both bars share one width
  (aligned); color thresholds green <50 / yellow <80 / red ≥80, applied to the bar and
  — independently — to the `→` projection. `→MM%` is projected usage at that window's
  reset assuming the **average pace so far in the window** continues:
  `pct / fractionElapsed` (from `resets_at` minus the window length, 5h / 7d; null when
  <5% elapsed). Computed in `usage.ts`. No `$`, no burn-rate, no raw token counts (δ
  only exposes percentages).

## Module map

| File                | Responsibility                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli.ts`        | arg parsing → `widget` / `launch` / `canvas` / `show` / `statusline` / `install-statusline` / `doctor` (+ internal `canvas-serve`) |
| `src/widget.ts`     | widget render loop (`--once` for one frame)                                                                                        |
| `src/render.ts`     | render the two aligned, colored 5h/7d usage bars, sized to the pane                                                                |
| `src/ansi.ts`       | ANSI color / dim / cursor escape helpers used by the widget                                                                        |
| `src/launch.ts`     | build the tmux layout (default 4-col; `--canvas` = left half is `canvas.cols` work cols + GUI canvas)                              |
| `src/canvas.ts`     | `--canvas` layout (B): localhost canvas server, `myx show`, GUI window tiling (macOS)                                              |
| `src/statusline.ts` | `myx statusline` (cache rate limits + passthrough) and `install-statusline`                                                        |
| `src/usage.ts`      | read the cached official rate limits → `UsageSnapshot` (plus `project()`)                                                          |
| `src/config.ts`     | load `~/.config/myx/config.json` + defaults                                                                                        |
| `src/doctor.ts`     | environment checks                                                                                                                 |
| `src/types.ts`      | `UsageSnapshot`                                                                                                                    |
| `test/*.test.ts`    | unit tests for the pure logic (`project`, `dur` / `bar` / `vis`, `renderFrame`, canvas helpers)                                    |

## Canvas layout (`--canvas`, macOS)

A second `launch` layout for showing things on the right. The left half of the screen
is tmux: `canvas.cols` work columns (default 2) with the usage widget pinned to the
bottom of the leftmost column; the **right half of the screen is a real
GUI window** (a Chrome `--app` window), not a tmux pane — Ghostty has no API to put
a process in a split, and a real window is the only way to get full HTML fidelity
(and the only way an app like Illustrator could ever live there, M3). claude drives
it from the left with `myx show <file|url>`.

- **`myx launch` / `myx canvas` always rebuild a fresh session** (kill any existing one
  first — no reuse, no `--fresh` flag). `canvasCommand` just calls `launch({canvas:true})`;
  both share `launch` in `launch.ts`. The kill has three cases (`launch`'s doc comment):
  **outside the target session** → kill + build + attach (or `switch-client` when nested
  in another tmux); **inside the target session** → a plain kill would kill the rebuild
  process too, so rename the live session aside (`<session>-old`), build the fresh one,
  `switch-client` this Ghostty to it, then kill the old as the last op (its pane — and any
  claude in it — dies with it, as intended); **`--no-attach`** (scripted/test) → build
  detached only, and refuse if run from inside the target. The canvas GUI (tile Ghostty
  left, empty idle canvas right via `canvasLaunchArrange`) runs on the attach paths only.
  The wrapper shows the waiting hint when state is `idle` (it clears any prior iframe).
- **Live-reload without a watcher:** `myx canvas-serve` runs a tiny localhost server
  (Node `http`, no npm deps) serving a wrapper page that polls `/state`; `myx show`
  writes `~/.cache/myx/canvas/state.json` and the page swaps its `<iframe>`. The
  served version embeds the file mtime, so **editing the shown file reloads it**.
  Sibling assets resolve (the file's dir is served under `/file/`, traversal-guarded).
- **osascript only opens/tiles the windows** (Chrome `bounds` for the canvas window,
  System Events for Ghostty). Needs Automation + Accessibility consent on first use;
  degrades to a printed hint when not granted. `--no-attach` skips the window arrange.
- **Native fullscreen owns its own Space** and can't share the screen with the canvas,
  so when `canvas.tileSelf` (default) myx drops Ghostty out of native fullscreen
  (`AXFullScreen`) and tiles it to the left half before placing the canvas right.
  `myx show` does this too, so it works even when launched from a fullscreen Ghostty.

## Dev commands

```bash
npm install
npm run once        # one frame to stdout
npm run typecheck   # tsc --noEmit
npm test            # node:test unit tests (run through tsx)
npm run format      # Prettier write (format:check to verify only)
./bin/myx doctor
./bin/myx launch --no-attach   # build the tmux session without attaching (for tests)

# `myx launch`/`canvas` now ALWAYS rebuild (kill the session first) — by design. But for
# Claude's own verification, NEVER kill/rebuild the live `myx` session: Claude runs inside it.
# To inspect a fresh layout, build it under a throwaway session name (set `session`
# in a temp config), then kill only that one. Read-only `tmux list-panes` is safe.

# feed a fake statusline payload (the cache is normally written by Claude Code):
echo '{"rate_limits":{"five_hour":{"used_percentage":68,"resets_at":0}}}' | ./bin/myx statusline
```

## History

An earlier iteration added an iCal Google-Calendar feature (`calendar.ts`,
`meeting.ts`, node-ical, `set-ical`). It was removed when the user chose to keep the
widget focused on usage — recoverable from git history if ever wanted.

## Conventions

- ESM, Node ≥ 20, run via `tsx` (no build step). `tsx` is a **runtime dependency**
  (`bin/myx` execs it); `typescript` is typecheck-only via `tsc`.
- Formatting is Prettier; tests are `node --test` run through tsx (no extra runtime
  deps). CI (`.github/workflows/ci.yml`) runs typecheck + tests + format check on
  Node 20 / 22.
- Follow the user's global rules: commits are authored normally with **no
  `Co-Authored-By` trailer** and no tool-promo lines.
