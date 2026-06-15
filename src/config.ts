import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export interface MyxConfig {
  /**
   * Height of the myx widget pane. `heightLines` (absolute terminal rows) wins
   * when set; otherwise `heightPct` is a percentage of the leftmost column.
   */
  pane: { heightPct: number; heightLines?: number };
  /** tmux session name used by `myx launch`. */
  session: string;
  /**
   * The `--canvas` layout (B): a real GUI window tiled to the right half that
   * `myx show` drives. macOS only.
   */
  canvas: {
    /** left-hand fraction of the screen given to Ghostty (the rest is the canvas) */
    split: number;
    /**
     * Number of work columns in the left (tmux) half. The myx widget always sits at
     * the bottom of the leftmost column; the remaining columns are full-height work.
     * 1 = a single work column (work above / widget below).
     */
    cols: number;
    /** port for the localhost canvas server */
    port: number;
    /** top margin (px) left for the menu bar when tiling */
    menuBarPx: number;
    /** also tile Ghostty itself to the left half on `launch --canvas` */
    tileSelf: boolean;
    /** override the Chrome binary used for the canvas window */
    chromePath?: string;
  };
  /** Existing statusLine command to chain after caching rate limits. */
  statuslinePassthrough?: string;
}

const DEFAULTS: MyxConfig = {
  // The widget is fixed-height content (two bars), so default to an absolute row
  // count — a percentage of the column leaves a tall, mostly-empty pane on big
  // screens. heightPct stays available for anyone who explicitly wants a ratio.
  pane: { heightPct: 24, heightLines: 2 },
  session: "myx",
  canvas: { split: 0.5, cols: 2, port: 7842, menuBarPx: 25, tileSelf: true },
};

export function configPath(): string {
  return path.join(os.homedir(), ".config", "myx", "config.json");
}

/** Where `myx statusline` caches the official rate-limit snapshot. */
export function usageCachePath(): string {
  return path.join(os.homedir(), ".cache", "myx", "usage.json");
}

/** Absolute path to the `myx` executable, used to spawn `myx widget` / `myx canvas-serve`. */
export function myxBin(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "myx");
}

/** Load config from ~/.config/myx/config.json, falling back to defaults. */
export function loadConfig(): MyxConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const j = JSON.parse(raw) as Partial<MyxConfig>;
    return {
      ...DEFAULTS,
      ...j,
      // When the user supplies their own pane config, respect it as given (only
      // backfilling heightPct) — don't inject the default heightLines, so an
      // explicit heightPct isn't silently overridden by the absolute default.
      pane: j.pane
        ? {
            heightPct: j.pane.heightPct ?? DEFAULTS.pane.heightPct,
            heightLines: j.pane.heightLines,
          }
        : { ...DEFAULTS.pane },
      canvas: { ...DEFAULTS.canvas, ...(j.canvas ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

/** Merge-write a partial config to ~/.config/myx/config.json. */
export function updateConfig(partial: Partial<MyxConfig>): void {
  let current: Partial<MyxConfig> = {};
  try {
    current = JSON.parse(fs.readFileSync(configPath(), "utf8")) as Partial<MyxConfig>;
  } catch {
    /* no file yet */
  }
  const next = { ...current, ...partial };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n");
}
