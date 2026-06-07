# myx-cli

A small always-on widget for the **bottom-left tmux pane** while you run `claude`
in Ghostty. It shows your official Claude usage:

```
5h ████████░░░░ 28% →44%  ⏳3h18m
7d █████░░░░░░░ 35% →64%
```

- **5-hour** and **weekly** rate-limit bars with reset countdowns, color-coded
  green / yellow / red.
- `→NN%` is the projected usage at that window's reset if your average pace so far
  in the window continues (red when you're on pace to exceed).

## How it works

- **Layout**: Ghostty has no IPC to place a process in a split, so the layout is
  driven by tmux — `myx launch` opens four columns of shells in your current
  directory, with the widget tucked into the bottom of the leftmost column.
- **Usage**: the official 5h/7d percentages come from the JSON Claude Code passes
  to its `statusLine` command (`rate_limits.*`). `myx statusline` caches that
  payload; the widget reads the cache. No API keys, no estimation.

## Quick start

```bash
npm install
npm run once                # render a single frame

# wire official usage into the widget (backs up settings.json and chains any
# existing statusLine), then restart Claude Code:
./bin/myx install-statusline

# one-time tmux setup (truecolor + mouse): add scripts/tmux-myx.conf to your
# tmux config (e.g. ~/.config/tmux/tmux.conf), then restart tmux

./bin/myx launch            # build the layout and attach; run `claude` in any work pane
./bin/myx doctor            # check tmux / statusLine / cache / config
```

## Configuration

Optional, at `~/.config/myx/config.json` (see `config.example.json`):

| Key | Meaning |
| --- | --- |
| `pane` | widget pane size: `heightPct` of the window, `leftWidthPct` of the bottom strip |
| `session` | tmux session name for `myx launch` |
| `statuslinePassthrough` | set automatically by `install-statusline` to chain your previous statusLine |

## Status

Usage display (official 5h/7d via the statusLine) is done. An earlier calendar
feature was removed to keep the widget focused on usage; it's recoverable from git
history if ever wanted.
