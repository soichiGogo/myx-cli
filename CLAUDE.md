# CLAUDE.md — myx-cli

Guidance for working in this repo. Keep it consistent with the locked design below.

## What this is

A TypeScript/Node widget that runs in the **bottom-left tmux pane** while the user
runs `claude` in **Ghostty**, showing:

1. **Claude 5h-block usage %** (estimated) + projected % at reset.
2. The **next 2 Google Calendar events**, with a clickable **▶Join** for online meetings.

## Locked design decisions (and why)

- **Layout = tmux.** Ghostty exposes no IPC to place a process in a given split
  (no `kitten @` / `wezterm cli` equivalent — verified). So the layout is built by
  tmux: main pane (claude) + bottom-left widget + bottom-right shell. See `src/launch.ts`.
- **Usage = ccusage, spawned.** We shell out to `ccusage blocks --active --json`
  rather than re-parsing `~/.claude/**/*.jsonl` ourselves. Fields used:
  `totalTokens`, `burnRate.tokensPerMinute`, `projection.{totalTokens,remainingMinutes}`,
  `startTime`/`endTime`. `costUSD` is **not displayed** (user wants no `$`).
- **5h % is an estimate (γ).** Anthropic's official 5h limit % is only in the
  `anthropic-ratelimit-unified-*` response headers (what `/usage` shows) and is **not
  persisted to disk** (verified: 0 hits across recent transcripts/cache). Reading it
  live would need the OAuth token + an undocumented endpoint (unofficial, fragile,
  ToS-gray) — rejected. Instead: `pct = currentTokens / blockTokenLimit`.
  `blockTokenLimit` = a calibrated number, `"max"` (peak-relative, default), or `null`
  (fall back to a time-elapsed bar). The bar **and** the projection share this denominator.
- **No burn-rate number.** Usage is two lines: `5h <bar> ~NN%` then
  `⏳ <reset>  🔥 NN% proj` — the projected % at reset
  (`projection.totalTokens / blockTokenLimit`). When on pace to exceed before
  reset, the second line becomes `🔥 LIMIT <t> ⚠`. Style chosen by the user.
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
| `src/cli.ts` | arg parsing → `widget` / `launch` / `doctor` |
| `src/index.ts` | widget render loop (`--once` for one frame) |
| `src/render.ts` | width-aware frame (never wraps): titles truncate, ▶ link compacts, bar scales, ⏳ reset / 🔥 proj |
| `src/launch.ts` | build the tmux layout |
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

- [x] **Phase 1** — scaffold + tmux launcher + placeholder widget (this commit)
- [ ] **Phase 2** — `usage.ts`: ccusage → real 5h % + projection (γ / calibration)
- [ ] **Phase 3** — `calendar.ts` + `meeting.ts`: iCal → next events + ▶Join
- [~] **Phase 4** — render polish: width-aware layout **done**; remaining: bar-denominator calibration, stale UX, ⌘+click verification on real tmux
- [ ] **Phase 5** — docs + auto-launch on Ghostty start + richer `doctor`

## Conventions

- ESM, Node ≥ 20, run via `tsx` (no build step); `tsc` is typecheck-only.
- Follow the user's global rules: commits are authored normally with **no
  `Co-Authored-By` trailer** and no tool-promo lines.
