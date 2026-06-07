# myx-cli

A small always-on widget for the **bottom-left tmux pane** while you run `claude`
in Ghostty. It shows:

- **Claude 5-hour block usage %** (estimated; from [`ccusage`](https://github.com/ryoppippi/ccusage))
  and the projected usage at the next reset.
- The **next 2 Google Calendar events**, with a clickable **▶Join** for events
  that have an online-meeting link (⌘+click — OSC 8 hyperlink).

```
🗓 10:00 Standup   23m ▶Join
🗓 14:00 1on1       4h
──────────────────────────
5h ████████░░░░ ~68%
⏳ 3h18m     🔥 97% proj
```

## Why tmux?

Ghostty has no IPC to place a process in a specific split, so the layout is
driven by tmux: a main pane (claude) plus a small bottom-left widget pane.

## Quick start

```bash
npm install
npm run once       # render a single frame to check the layout
npx tsx src/cli.ts doctor   # or: ./bin/myx doctor

# one-time tmux setup (colors + ⌘+click links):
cat scripts/tmux-myx.conf >> ~/.tmux.conf   # then restart tmux

./bin/myx launch   # build the layout and attach; run `claude` in the main pane
```

## Configuration

Config lives at `~/.config/myx/config.json` (see `config.example.json`).

> The `icalUrl` is a **secret** (anyone with it can read your calendar). It is
> kept outside the repo and must never be committed.

| Key | Meaning |
| --- | --- |
| `icalUrl` | Google Calendar → Settings → *Integrate calendar* → **Secret address in iCal format** |
| `blockTokenLimit` | `number` (calibrated), `"max"` (peak-relative estimate), or `null` (time-elapsed bar) |
| `refresh` | poll intervals (seconds) for usage / calendar |
| `pane` | widget pane size: `heightPct` of the window, `leftWidthPct` of the bottom strip |

### Calibrating the 5h %

Anthropic does not publish the exact 5h token limit, so the % is an estimate.
For an accurate denominator: the next time you actually hit the Max limit, note
`ccusage blocks --active` → `totalTokens` and set that as `blockTokenLimit`.

## Status

Phase 1 (scaffold + tmux launcher + placeholder widget). Usage and calendar wiring
land in later phases — see `CLAUDE.md`.
