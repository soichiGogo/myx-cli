import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configPath, loadConfig, usageCachePath } from "./config.ts";
import { readUsage } from "./usage.ts";
import { chromeBin } from "./canvas.ts";

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
  line(
    tmuxOk,
    `tmux (${tmuxV || "not found"})`,
    tmuxOk ? "layout + pane-pinning hooks OK (≥3.4)" : "need ≥3.4 for `myx launch`",
  );

  // Is Claude Code's statusLine wired to a myx binary that actually exists?
  let statusCmd = "";
  try {
    const s = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8"),
    ) as {
      statusLine?: { command?: string };
    };
    statusCmd = s.statusLine?.command ?? "";
  } catch {
    /* no settings */
  }
  const wired = statusCmd.includes("myx") && statusCmd.includes("statusline");
  // The command is `<abs path>/bin/myx statusline`; verify that path still resolves.
  // A moved/renamed repo leaves a dead path here, so the statusLine fails silently and
  // the cache goes stale — checking only the command string would report a false ✓.
  const myxPath = statusCmd.split(/\s+/).find((t) => /(^|\/)myx$/.test(t)) ?? "";
  const pathOk = myxPath.startsWith("/") ? fs.existsSync(myxPath) : true;
  line(
    wired && pathOk,
    "statusLine → myx",
    !wired
      ? "run `myx install-statusline`"
      : pathOk
        ? "official 5h/7d usage enabled"
        : `command path missing (${myxPath}) — run \`myx install-statusline\``,
  );

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
  line(
    fs.existsSync(configPath()),
    `config (${configPath()})`,
    fs.existsSync(configPath()) ? "" : "using defaults",
  );
  if (cfg.statuslinePassthrough)
    line(true, "statusLine passthrough", "your previous statusline is chained");

  // Canvas layout (`launch --canvas` / `myx show`) drives a Chrome app window — macOS only.
  if (process.platform === "darwin") {
    const chrome = chromeBin(cfg);
    const chromeOk = fs.existsSync(chrome);
    line(
      chromeOk,
      "canvas browser (Chrome)",
      chromeOk
        ? "`myx launch --canvas` + `myx show` ready (grant Automation/Accessibility on first use)"
        : "Chrome not found — install it or set canvas.chromePath",
    );
  } else {
    line(false, "canvas (--canvas)", "macOS only — needs GUI window control");
  }
}
