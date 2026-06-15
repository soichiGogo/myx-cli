import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadConfig, myxBin, updateConfig, usageCachePath } from "./config.ts";

function settingsPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

/** Atomically write the rate-limit snapshot extracted from a statusLine payload. */
function cacheRateLimits(input: string): void {
  const j = JSON.parse(input) as {
    rate_limits?: {
      five_hour?: { used_percentage?: number; resets_at?: number };
      seven_day?: { used_percentage?: number; resets_at?: number };
    };
  };
  const rl = j.rate_limits ?? {};
  const snap = {
    fiveHourPct: rl.five_hour?.used_percentage ?? null,
    fiveHourResetAt: rl.five_hour?.resets_at ?? null,
    sevenDayPct: rl.seven_day?.used_percentage ?? null,
    sevenDayResetAt: rl.seven_day?.resets_at ?? null,
    updatedAt: Date.now(),
  };
  const p = usageCachePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snap));
  fs.renameSync(tmp, p);
}

/**
 * `myx statusline` — invoked by Claude Code as the statusLine command. Caches the
 * official rate limits for the widget, then forwards stdin to the user's previous
 * statusLine command (if any) so their bar renders unchanged.
 */
export function statusline(): void {
  let input = "";
  try {
    input = fs.readFileSync(0, "utf8");
  } catch {
    return;
  }
  try {
    cacheRateLimits(input);
  } catch {
    /* never break the statusline on bad input */
  }
  const pass = loadConfig().statuslinePassthrough;
  if (pass) {
    try {
      process.stdout.write(execSync(pass, { input, encoding: "utf8", shell: "/bin/bash" }));
    } catch {
      /* if the chained command fails, render nothing rather than crash */
    }
  }
}

/**
 * `myx install-statusline` — point Claude Code's statusLine at `myx statusline`,
 * preserving any existing command as a passthrough. Backs up settings first.
 * Run this yourself; it intentionally mutates ~/.claude/settings.json.
 */
export function installStatusline(): void {
  const sp = settingsPath();
  const myxCmd = `${myxBin()} statusline`;
  const settings = JSON.parse(fs.readFileSync(sp, "utf8")) as {
    statusLine?: { type?: string; command?: string; padding?: number };
  };

  const current = settings.statusLine?.command;
  if (current && !current.includes("myx") && current !== myxCmd) {
    updateConfig({ statuslinePassthrough: current });
    console.log("• Saved your existing statusLine as passthrough (chained after myx).");
  }

  fs.copyFileSync(sp, `${sp}.bak-myx`);
  settings.statusLine = {
    type: "command",
    command: myxCmd,
    ...(settings.statusLine?.padding != null ? { padding: settings.statusLine.padding } : {}),
  };
  fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + "\n");

  console.log(`• Updated ${sp} (backup: ${sp}.bak-myx).`);
  console.log("• Restart Claude Code; the widget will pick up official 5h/7d usage.");
}
