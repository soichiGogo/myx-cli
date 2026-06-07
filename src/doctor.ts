import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configPath, loadConfig, usageCachePath } from "./config.ts";
import { readUsage } from "./usage.ts";

function line(ok: boolean, label: string, note = ""): void {
  console.log(`${ok ? "✓" : "✗"} ${label}${note ? ` — ${note}` : ""}`);
}

/** Environment checks for the moving parts (tmux, statusLine, usage cache, config). */
export function doctor(): void {
  console.log("myx doctor\n");

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  line(nodeMajor >= 20, `Node ${process.version}`, nodeMajor >= 20 ? "" : "need ≥20");

  let tmuxV = "";
  try {
    tmuxV = execFileSync("tmux", ["-V"], { encoding: "utf8" }).trim();
  } catch {
    /* not installed */
  }
  const m = tmuxV.match(/(\d+)\.(\d+)/);
  const tmuxOk = m ? Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 4) : false;
  line(tmuxOk, `tmux (${tmuxV || "not found"})`, tmuxOk ? "OSC8 hyperlinks OK (≥3.4)" : "need ≥3.4 for ▶Join");

  // Is Claude Code's statusLine wired to myx (so official usage flows in)?
  let wired = false;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8")) as {
      statusLine?: { command?: string };
    };
    const c = s.statusLine?.command ?? "";
    wired = c.includes("myx") && c.includes("statusline");
  } catch {
    /* no settings */
  }
  line(wired, "statusLine → myx", wired ? "official 5h/7d usage enabled" : "run `myx install-statusline`");

  const u = readUsage();
  const hasData = u.fiveHourPct != null;
  line(
    hasData && !u.stale,
    `usage cache (${usageCachePath()})`,
    !hasData
      ? "no data yet — start Claude Code after install"
      : u.stale
        ? "stale (Claude idle)"
        : `5h ${Math.round(u.fiveHourPct!)}% / 7d ${u.sevenDayPct != null ? Math.round(u.sevenDayPct) + "%" : "--"}`,
  );

  const cfg = loadConfig();
  line(fs.existsSync(configPath()), `config (${configPath()})`, fs.existsSync(configPath()) ? "" : "using defaults");
  line(!!cfg.icalUrl, "icalUrl set", cfg.icalUrl ? "" : "calendar disabled until set (Phase 3)");
  if (cfg.statuslinePassthrough) line(true, "statusLine passthrough", "your previous statusline is chained");
}
