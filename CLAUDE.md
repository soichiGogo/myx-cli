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

| File                | Responsibility                                                                     |
| ------------------- | ---------------------------------------------------------------------------------- |
| `src/cli.ts`        | arg parsing → `widget` / `launch` / `statusline` / `install-statusline` / `doctor` |
| `src/widget.ts`     | widget render loop (`--once` for one frame)                                        |
| `src/render.ts`     | render the two aligned, colored 5h/7d usage bars, sized to the pane                |
| `src/ansi.ts`       | ANSI color / dim / cursor escape helpers used by the widget                        |
| `src/launch.ts`     | build the tmux layout                                                              |
| `src/statusline.ts` | `myx statusline` (cache rate limits + passthrough) and `install-statusline`        |
| `src/usage.ts`      | read the cached official rate limits → `UsageSnapshot` (plus `project()`)          |
| `src/config.ts`     | load `~/.config/myx/config.json` + defaults                                        |
| `src/doctor.ts`     | environment checks                                                                 |
| `src/types.ts`      | `UsageSnapshot`                                                                    |
| `test/*.test.ts`    | unit tests for the pure logic (`project`, `dur` / `bar` / `vis`, `renderFrame`)    |

## Dev commands

```bash
npm install
npm run once        # one frame to stdout
npm run typecheck   # tsc --noEmit
npm test            # node:test unit tests (run through tsx)
npm run format      # Prettier write (format:check to verify only)
./bin/myx doctor
./bin/myx launch --no-attach   # build the tmux session without attaching (for tests)

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
