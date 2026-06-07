# myx-cli

A small always-on widget for the **bottom-left tmux pane** while you run `claude`
in Ghostty. It shows:

- **Claude usage** — your official **5-hour** and **weekly** rate-limit bars with
  reset countdowns, color-coded green/yellow/red.
- The **next 2 Google Calendar events**, with a clickable **▶Join** for events
  that have an online-meeting link (⌘+click — OSC 8 hyperlink).

```
🗓 10:00 Standup   23m ▶Join
🗓 14:00 1on1       4h
──────────────────────────
5h ██████░░ 68% →94% ⏳3h18m
7d ███░░░░░ 41% →48%
```

`→NN%` is the projected usage at that window's reset if your average pace so far
in the window continues.

## How it works

- **Layout**: Ghostty has no IPC to place a process in a split, so the layout is
  driven by tmux — a main pane (claude) plus a small bottom-left widget pane.
- **Usage**: the official 5h/7d percentages come from the JSON Claude Code passes
  to its `statusLine` command (`rate_limits.*`). `myx statusline` caches that
  payload; the widget reads the cache. No API keys, no estimation.
- **Calendar** (Phase 3): an iCal secret URL is fetched and parsed in-process.

## Quick start

```bash
npm install
npm run once                 # render a single frame to check the layout

# wire official 5h/7d usage into the widget (backs up settings.json,
# chains any existing statusLine), then restart Claude Code:
./bin/myx install-statusline

# one-time tmux setup (colors + ⌘+click links):
cat scripts/tmux-myx.conf >> ~/.tmux.conf   # then restart tmux

./bin/myx launch            # build the layout and attach; run `claude` in the main pane
./bin/myx doctor            # check tmux / statusLine / cache / config
```

## Configuration

Config lives at `~/.config/myx/config.json` (see `config.example.json`).

> The `icalUrl` is a **secret** (anyone with it can read your calendar). It is
> kept outside the repo and must never be committed.

Set it without hand-editing JSON:

```bash
./bin/myx set-ical 'https://calendar.google.com/calendar/ical/.../private-.../basic.ics'
```

| Key | Meaning |
| --- | --- |
| `icalUrl` | Google Calendar → Settings → *Integrate calendar* → **Secret address in iCal format** |
| `refresh` | poll intervals (seconds) for usage / calendar |
| `events` | how many upcoming events to show |
| `pane` | widget pane size: `heightPct` of the window, `leftWidthPct` of the bottom strip |
| `statuslinePassthrough` | set automatically by `install-statusline` to chain your previous statusLine |

## Status

Phases 1–3 are done: tmux launcher + widget, official 5h/7d usage via statusLine,
and the iCal calendar (recurring events + ▶Join). Set `icalUrl` to see your own
events. See `CLAUDE.md` for remaining polish.
