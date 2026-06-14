import os from "node:os";
import path from "node:path";
import fs from "node:fs";

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
  pane: { heightPct: 24 },
  session: "myx",
  canvas: { split: 0.5, port: 7842, menuBarPx: 25, tileSelf: true },
};

export function configPath(): string {
  return path.join(os.homedir(), ".config", "myx", "config.json");
}

/** Where `myx statusline` caches the official rate-limit snapshot. */
export function usageCachePath(): string {
  return path.join(os.homedir(), ".cache", "myx", "usage.json");
}

/** Load config from ~/.config/myx/config.json, falling back to defaults. */
export function loadConfig(): MyxConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const j = JSON.parse(raw) as Partial<MyxConfig>;
    return {
      ...DEFAULTS,
      ...j,
      pane: { ...DEFAULTS.pane, ...(j.pane ?? {}) },
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
