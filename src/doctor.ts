import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { configPath, loadConfig } from "./config.ts";

function line(ok: boolean, label: string, note = ""): void {
  console.log(`${ok ? "✓" : "✗"} ${label}${note ? ` — ${note}` : ""}`);
}

/** Environment checks for the moving parts (tmux, ccusage, config). */
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

  let ccusage = false;
  try {
    execFileSync("ccusage", ["--version"], { stdio: "ignore" });
    ccusage = true;
  } catch {
    /* fall back to npx */
  }
  line(ccusage, "ccusage", ccusage ? "" : "not on PATH — will use `npx ccusage`");

  const cfgExists = fs.existsSync(configPath());
  line(cfgExists, `config (${configPath()})`, cfgExists ? "" : "using defaults");
  if (cfgExists) {
    const c = loadConfig();
    line(!!c.icalUrl, "icalUrl set", c.icalUrl ? "" : "calendar disabled until set");
  }
}
