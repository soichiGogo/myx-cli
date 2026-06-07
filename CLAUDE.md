# CLAUDE.md — myx-cli

Guidance for working in this repo. Keep it consistent with the locked design below.

## What this is

A TypeScript/Node widget that runs in the **bottom-left tmux pane** while the user
runs `claude` in **Ghostty**, showing:

1. **Official Claude usage** — 5-hour and weekly rate-limit bars with reset countdowns.
2. The **next 2 Google Calendar events**, with a clickable **▶Join** for online meetings.

## Locked design decisions (and why)

- **Layout = tmux.** Ghostty exposes no IPC to place a process in a given split
  (no `kitten @` / `wezterm cli` equivalent — verified). So the layout is built by
  tmux: main pane (claude) + bottom-left widget + bottom-right shell. See `src/launch.ts`.
- **Usage = official rate limits via statusLine (δ).** Claude Code passes
  `rate_limits.five_hour.{used_percentage,resets_at}` and `.seven_day.{…}` to its
  `statusLine` command on stdin (documented in the statusline docs). `myx statusline`
  caches that payload to `~/.cache/myx/usage.json`; the widget reads it (`src/usage.ts`).
  This **supersedes the earlier ccusage/γ-estimate plan** — the % is now the *official*
  number, no auth, no calibration, and we also get the weekly limit. `myx
  install-statusline` wires it up and **chains** any existing statusLine (saved as
  `statuslinePassthrough`) so the user's own bar is preserved. ccusage is no longer used.
  (Earlier finding: the rate-limit headers are *not* persisted to disk, so the statusLine
  stdin payload is the supported way to get the official numbers — don't re-litigate.)
- **Usage display = two colored bars** like Claude Code's `/usage`:
  `5h <bar> NN% →MM% ⏳<reset>` and `7d <bar> NN% →MM%`. Both bars share one width
  (aligned); color thresholds green <50 / yellow <80 / red ≥80, applied to the bar
  and — independently — to the `→` projection (so heading-to-red shows red). `→MM%`
  is the projected usage at that window's reset assuming the **average pace so far in
  the window** continues: `pct / fractionElapsed`, where `fractionElapsed` comes from
  `resets_at` minus the window length (5h / 7d). Null when <5% elapsed. Computed in
  `usage.ts` from the official numbers — no history, no ccusage. No `$`, no burn-rate.
  (Recent-burst rate was rejected: extrapolating a few minutes over a 7-day window
  is nonsense; average-pace is stable and meaningful for both windows.)
- **Calendar = iCal secret URL.** Pure Node fetch + `node-ical` (RRULE expansion) →
  next events. Chosen over the Google API for auth simplicity; keep the data source
  swappable so an API backend can be added later. The URL is a **password-grade secret**:
  it lives only in `~/.config/myx/config.json` and is gitignored — never log it or pass
  it as a CLI arg.
- **Meeting open = OSC 8 ⌘+click.** `▶Join` is an OSC 8 hyperlink (see `osc8()` in
  `src/render.ts`). A true single-click button would fight tmux's mouse handling, so it
  was rejected. Needs tmux ≥ 3.4 + `terminal-features ...:hyperlinks` (see
  `scripts/tmux-myx.conf`). Link extraction order (Phase 3): `X-GOOGLE-CONFERENCE` →
  `LOCATION` → `DESCRIPTION`.

## Module map

| File | Responsibility |
| --- | --- |
| `src/cli.ts` | arg parsing → `widget` / `launch` / `set-ical` / `statusline` / `install-statusline` / `doctor` |
| `src/index.ts` | widget render loop + calendar refresh (`--once` for one frame) |
| `src/render.ts` | width-aware frame (never wraps): titles truncate, ▶ link compacts, aligned 5h/7d colored bars |
| `src/launch.ts` | build the tmux layout |
| `src/statusline.ts` | `myx statusline` (cache rate limits + passthrough) and `install-statusline` |
| `src/usage.ts` | read the cached official rate limits → `UsageSnapshot` |
| `src/calendar.ts` | fetch + parse the iCal URL, expand recurrences → next events |
| `src/meeting.ts` | extract an online-meeting URL from a VEVENT |
| `src/config.ts` | load `~/.config/myx/config.json` + defaults |
| `src/doctor.ts` | environment checks |
| `src/types.ts` | shared types (`CalEvent`, `UsageSnapshot`, `WidgetState`) |

## Dev commands

```bash
npm install
npm run once        # one frame to stdout
npm run typecheck   # tsc --noEmit
./bin/myx doctor
./bin/myx launch --no-attach   # build the tmux session without attaching (for tests)
```

## Roadmap

- [x] **Phase 1** — scaffold + tmux launcher + placeholder widget
- [x] **Phase 2** — official usage via statusLine (δ): `statusline.ts` cache + `usage.ts` read → aligned 5h/7d colored bars
- [x] **Phase 3** — `calendar.ts` + `meeting.ts`: iCal → next events + ▶Join (node-ical `expandRecurringEvent`)
- [~] **Phase 4** — width-aware layout + color + projection **done**; remaining: all-day events render at 00:00, stale UX, ⌘+click verification on real tmux, statusline startup latency (~150ms)
- [ ] **Phase 5** — docs + auto-launch on Ghostty start + richer `doctor`

## Conventions

- ESM, Node ≥ 20, run via `tsx` (no build step); `tsc` is typecheck-only.
- node-ical is **CommonJS**: `import nodeIcal from "node-ical"; const { sync, expandRecurringEvent } = nodeIcal`.
  Named imports (`import { sync } from "node-ical"`) typecheck but throw at runtime under tsx — don't reintroduce.
- Follow the user's global rules: commits are authored normally with **no
  `Co-Authored-By` trailer** and no tool-promo lines.
