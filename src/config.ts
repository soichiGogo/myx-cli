import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export interface MyxConfig {
  /** iCal secret URL for the calendar (read-only). Treated like a password. */
  icalUrl?: string;
  timezone: string;
  /** 5h block token budget used as the bar denominator. */
  blockTokenLimit: number | "max" | null;
  refresh: { usageSec: number; calendarSec: number };
  /** Number of upcoming events to show. */
  events: number;
  pane: { heightPct: number; leftWidthPct: number };
  /** tmux session name used by `myx launch`. */
  session: string;
}

const DEFAULTS: MyxConfig = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  blockTokenLimit: "max",
  refresh: { usageSec: 10, calendarSec: 120 },
  events: 2,
  pane: { heightPct: 24, leftWidthPct: 32 },
  session: "myx",
};

export function configPath(): string {
  return path.join(os.homedir(), ".config", "myx", "config.json");
}

/** Load config from ~/.config/myx/config.json, falling back to defaults. */
export function loadConfig(): MyxConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const j = JSON.parse(raw) as Partial<MyxConfig>;
    return {
      ...DEFAULTS,
      ...j,
      refresh: { ...DEFAULTS.refresh, ...(j.refresh ?? {}) },
      pane: { ...DEFAULTS.pane, ...(j.pane ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}
