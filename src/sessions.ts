import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { loadConfig } from "./config.ts";
import { currentSession } from "./launch.ts";

/**
 * Session management for the myx family. `myx launch` never kills a session (each run
 * auto-numbers a new one — see `launch.ts`), so sessions accumulate; this is how they
 * get cleaned up. `myx sessions` lists the family with a one-line status each and lets
 * you pick one to kill; `myx kill <name>` removes one non-interactively.
 *
 * The "family" is the base session name (config `session`, default `myx`, or `--session`)
 * plus its `base-N` auto-numbered siblings — the same name model `launch` uses. Unrelated
 * tmux sessions are never listed or killed.
 */

const tmuxOut = (args: string[]): string => execFileSync("tmux", args, { encoding: "utf8" }).trim();

export interface SessionRow {
  name: string;
  /** basename of the session's active-pane cwd ("-" when unknown). */
  dir: string;
  idleSeconds: number;
  attached: boolean;
  /** true when this is the session the current process is running inside. */
  current: boolean;
}

/** A session is in the `base` family when it is `base` itself or `base-<suffix>`. */
export function isFamily(name: string, base: string): boolean {
  return name === base || name.startsWith(`${base}-`);
}

/** Sort key within a family: base first (0), then by numeric suffix; oddballs last. */
export function familyOrder(name: string, base: string): number {
  if (name === base) return 0;
  const n = Number(name.slice(base.length + 1));
  return Number.isInteger(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

/** Human idle span from seconds: "<1m", "5m", "2h", "3d". */
export function formatIdle(seconds: number): string {
  if (seconds < 60) return "<1m";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * myx-family sessions ordered base-first then by number. Returns [] when no tmux server
 * is running or nothing matches. `now` is injectable for tests.
 */
export function listSessions(base: string, now: number = Date.now()): SessionRow[] {
  let raw: string;
  try {
    // pane_current_path expands to the session's active pane in list-sessions context.
    raw = tmuxOut([
      "list-sessions",
      "-F",
      "#{session_name}\t#{session_attached}\t#{session_activity}\t#{pane_current_path}",
    ]);
  } catch {
    return []; // no tmux server → no sessions
  }
  if (!raw) return [];
  const cur = currentSession();
  const nowSec = Math.floor(now / 1000);
  return raw
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((f) => f[0] && isFamily(f[0], base))
    .map((f) => {
      const [name, attached, activity, path] = f;
      const act = Number(activity) || nowSec;
      const leaf = (path ?? "").split("/").filter(Boolean).pop();
      return {
        name: name!,
        dir: leaf || "-",
        idleSeconds: Math.max(0, nowSec - act),
        attached: Number(attached) > 0,
        current: name === cur,
      };
    })
    .sort((a, b) => familyOrder(a.name, base) - familyOrder(b.name, base));
}

/** Aligned, numbered table for the interactive picker; current session tagged "(this)". */
export function formatSessionsTable(rows: SessionRow[]): string {
  const H = { idx: "#", name: "session", dir: "dir", idle: "idle", client: "client" };
  const cells = rows.map((r, i) => ({
    idx: String(i + 1),
    name: r.name,
    dir: r.dir,
    idle: formatIdle(r.idleSeconds),
    client: r.attached ? "attached" : "-",
    tag: r.current ? "  (this)" : "",
  }));
  const width = (k: "idx" | "name" | "dir" | "idle" | "client") =>
    Math.max(H[k].length, ...cells.map((c) => c[k].length));
  const wi = width("idx");
  const wn = width("name");
  const wd = width("dir");
  const wl = width("idle");
  const wc = width("client");
  const row = (idx: string, name: string, dir: string, idle: string, client: string, tag = "") =>
    `  ${idx.padStart(wi)}  ${name.padEnd(wn)}  ${dir.padEnd(wd)}  ${idle.padEnd(wl)}  ${client.padEnd(wc)}${tag}`.trimEnd();
  const out = [row(H.idx, H.name, H.dir, H.idle, H.client)];
  for (const c of cells) out.push(row(c.idx, c.name, c.dir, c.idle, c.client, c.tag));
  return out.join("\n");
}

function killSession(name: string): void {
  execFileSync("tmux", ["kill-session", "-t", name], { stdio: "ignore" });
}

/**
 * `myx sessions` — list the family and interactively pick one to kill. Single-shot
 * (kills at most one, then exits; re-run to remove more). Prints a hint and exits
 * without prompting when stdin is not a TTY.
 */
export async function sessionsCommand(session?: string): Promise<void> {
  const base = session ?? loadConfig().session;
  const rows = listSessions(base);
  if (rows.length === 0) {
    console.log(`no '${base}' sessions.`);
    return;
  }
  console.log(formatSessionsTable(rows));
  if (!process.stdin.isTTY) {
    console.log(`\nnot a tty — kill one with: myx kill <name>`);
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, (a) => res(a.trim())));
  try {
    let pick: SessionRow | undefined;
    for (;;) {
      const ans = (await ask("\nkill which? (number / q): ")).toLowerCase();
      if (ans === "" || ans === "q") {
        console.log("cancelled.");
        return;
      }
      const n = Number(ans);
      if (Number.isInteger(n) && n >= 1 && n <= rows.length) {
        pick = rows[n - 1];
        break;
      }
      console.log(`enter 1–${rows.length}, or q to cancel.`);
    }
    const warn = pick!.current ? " (the session you're in — this pane will close)" : "";
    const yn = (await ask(`kill '${pick!.name}'${warn}? [y/N]: `)).toLowerCase();
    if (yn !== "y" && yn !== "yes") {
      console.log("cancelled.");
      return;
    }
    killSession(pick!.name);
    console.log(`✓ killed ${pick!.name}`);
  } finally {
    rl.close();
  }
}

/** `myx kill <name>` — non-interactive; only removes a session in the myx family. */
export function killCommand(name: string, session?: string): void {
  const base = session ?? loadConfig().session;
  if (!name) {
    console.error("myx: kill requires a session name (see `myx sessions`)");
    process.exit(1);
  }
  if (!isFamily(name, base)) {
    console.error(
      `myx: '${name}' is not a '${base}' session — refusing to kill ` +
        `(pass --session <base> if you launched with a custom name)`,
    );
    process.exit(1);
  }
  if (!listSessions(base).some((r) => r.name === name)) {
    console.error(`myx: no session '${name}'`);
    process.exit(1);
  }
  killSession(name);
  console.log(`✓ killed ${name}`);
}
