# myx-cli

A small always-on terminal widget that shows your **official Claude usage** in the
bottom-left tmux pane while you work with `claude` in Ghostty.

```
5h ████████░░░░ 28% →44%  ⏳3h18m
7d █████░░░░░░░ 35% →64%
```

- **5-hour** and **weekly** rate-limit bars with reset countdowns (`⏳`),
  color-coded green / yellow / red.
- `→NN%` is the projected usage at that window's reset if your average pace so far
  in the window continues (red when you're on pace to exceed).

## How it works

`myx launch` builds a tmux layout — four equal columns of shells in your current
directory, with the widget pinned to the bottom of the leftmost column:

```
┌──────┬──────┬──────┬──────┐
│ work │      │      │      │
│      │ work │ work │ work │   run `claude` in any column
├──────┤      │      │      │
│ myx  │      │      │      │   ← the widget (fixed height)
└──────┴──────┴──────┴──────┘
```

(Ghostty has no API to place a process in a split, so the layout is driven by tmux.)

The usage numbers are **official**: Claude Code passes `rate_limits.five_hour` and
`rate_limits.seven_day` to its `statusLine` command on stdin. `myx statusline` caches
that payload to `~/.cache/myx/usage.json`; the widget reads the cache. No API keys, no
token estimation. The bars and countdowns redraw every second; the underlying
percentages refresh whenever Claude Code is active, and go `⚠` stale after ~10 minutes
idle.

## Requirements

- macOS + [Ghostty](https://ghostty.org)
- tmux ≥ 3.4
- Node ≥ 20
- Claude Code on a plan with usage limits (Pro / Max / …), so its statusLine exposes
  `rate_limits`

## Setup

```bash
npm install

# put `myx` on PATH so `myx launch` works from any directory
# (ensure ~/.local/bin is on your PATH):
ln -sf "$PWD/bin/myx" ~/.local/bin/myx

# wire official usage into the widget — backs up ~/.claude/settings.json and
# chains any existing statusLine — then restart Claude Code:
myx install-statusline

# one-time tmux setup (truecolor + mouse): add scripts/tmux-myx.conf to your
# tmux config (e.g. ~/.config/tmux/tmux.conf), then restart tmux

myx doctor          # verify tmux / statusLine / cache / config
```

## Usage

```bash
myx launch          # build the layout and attach (run `claude` in any column)
myx launch --fresh  # kill an existing session and rebuild (after a config change)
myx widget          # just the widget (what runs in the pane)
myx doctor          # environment checks
```

Run `myx launch --fresh` from a shell **outside** the `myx` session (e.g. a new
Ghostty tab) — run from inside, it would kill its own process before rebuilding.

## Configuration

Optional, at `~/.config/myx/config.json` (see `config.example.json`):

| Key | Meaning |
| --- | --- |
| `pane.heightLines` | myx pane height in absolute rows (e.g. `2`); held across window resizes |
| `pane.heightPct` | …or a percentage of the leftmost column (used when `heightLines` is unset) |
| `session` | tmux session name for `myx launch` (default `myx`) |
| `statuslinePassthrough` | set automatically by `install-statusline` to chain your previous statusLine |

## Notes

- An earlier version had a Google-Calendar feature; it was removed to keep the widget
  focused on usage (recoverable from git history if ever wanted).
