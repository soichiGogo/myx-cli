import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type MyxConfig } from "./config.ts";

/**
 * The "canvas" is the right-hand side of the B-layout: a real GUI window
 * (a Chrome `--app` window) tiled to the right half of the screen, which the
 * claude session on the left drives with `myx show <file|url>`.
 *
 * Coordination is deliberately process-light:
 *   - `myx show` writes the target into ~/.cache/myx/canvas/state.json (versioned).
 *   - a tiny localhost server (`myx canvas-serve`) serves a wrapper page that
 *     polls /state and swaps an <iframe> when the version changes — so editing
 *     the shown file live-reloads it with no extra flags and no websocket.
 *   - osascript is used only to open the window once and tile it (Chrome's own
 *     scripting for the precise canvas window, System Events for Ghostty).
 *
 * macOS only — it relies on GUI window control. Everything here is best-effort
 * and degrades to a printed hint when Automation/Accessibility isn't granted.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasState {
  version: number;
  kind: "file" | "url" | "idle";
  /** absolute file path, or a URL; "" when idle */
  target: string;
}

function canvasDir(): string {
  return path.join(os.homedir(), ".cache", "myx", "canvas");
}
function statePath(): string {
  return path.join(canvasDir(), "state.json");
}
function myxBin(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "myx");
}
function canvasUrl(cfg: MyxConfig): string {
  return `http://127.0.0.1:${cfg.canvas.port}/`;
}
function chromeBin(cfg: MyxConfig): string {
  return cfg.canvas.chromePath ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

/** Block the current thread for `ms` without spawning a process (used to await the window). */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ── pure helpers (unit-tested) ──────────────────────────────────────────────

/** Split a screen into left/right rectangles, leaving a top margin for the menu bar. */
export function halves(
  screen: { w: number; h: number },
  split = 0.5,
  menuBarPx = 25,
): { left: Rect; right: Rect } {
  const top = menuBarPx;
  const usableH = Math.max(1, screen.h - top);
  const leftW = Math.round(screen.w * split);
  return {
    left: { x: 0, y: top, w: leftW, h: usableH },
    right: { x: leftW, y: top, w: screen.w - leftW, h: usableH },
  };
}

/** Normalize a user target: http(s) URLs pass through; everything else is a file path. */
export function resolveTarget(
  input: string,
  cwd: string,
): { kind: "file" | "url"; target: string } {
  if (/^https?:\/\//i.test(input)) return { kind: "url", target: input };
  const target = input.startsWith("file://") ? fileURLToPath(input) : path.resolve(cwd, input);
  return { kind: "file", target };
}

/** AppleScript: find the canvas window by URL, raise + tile it, report whether it existed. */
export function tileCanvasScript(url: string, rect: Rect): string {
  const { x, y, w, h } = rect;
  return [
    `if application "Google Chrome" is running then`,
    `  set didTile to false`,
    `  tell application "Google Chrome"`,
    `    repeat with win in windows`,
    `      try`,
    `        if (URL of active tab of win) starts with "${url}" then`,
    `          set index of win to 1`,
    `          set bounds of win to {${x}, ${y}, ${x + w}, ${y + h}}`,
    `          set didTile to true`,
    `          exit repeat`,
    `        end if`,
    `      end try`,
    `    end repeat`,
    `    if didTile then activate`,
    `  end tell`,
    `  return didTile`,
    `else`,
    `  return false`,
    `end if`,
  ].join("\n");
}

/**
 * AppleScript: tile the frontmost window of a GUI app (e.g. Ghostty) via System
 * Events. A *native*-fullscreen window lives in its own Space and can't share the
 * screen with the canvas window, so we drop out of fullscreen (AXFullScreen) first,
 * then position/size it.
 */
export function ghosttyTileScript(rect: Rect, appName = "Ghostty"): string {
  const { x, y, w, h } = rect;
  return [
    `tell application "System Events"`,
    `  if exists (processes whose name is "${appName}") then`,
    `    tell process "${appName}"`,
    `      if exists front window then`,
    `        try`,
    `          if value of attribute "AXFullScreen" of front window is true then`,
    `            set value of attribute "AXFullScreen" of front window to false`,
    `            delay 1`,
    `          end if`,
    `        end try`,
    `        set position of front window to {${x}, ${y}}`,
    `        set size of front window to {${w}, ${h}}`,
    `      end if`,
    `    end tell`,
    `  end if`,
    `end tell`,
  ].join("\n");
}

/** The wrapper page served at `/`: polls /state and swaps the iframe on version change. */
export function wrapperHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>myx canvas</title>
<style>
  html, body { margin: 0; height: 100%; background: #111; }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
  #wait { color: #8a8a8a; font: 14px ui-sans-serif, system-ui; padding: 2rem; }
  code { color: #cfcfcf; }
</style>
</head>
<body>
<div id="wait">myx canvas — waiting for <code>myx show &lt;file|url&gt;</code> …</div>
<iframe id="f" style="display:none"></iframe>
<script>
  let cur = null;
  async function tick() {
    try {
      const s = await (await fetch("/state", { cache: "no-store" })).json();
      if (s.v !== cur) {
        cur = s.v;
        const f = document.getElementById("f");
        const wait = document.getElementById("wait");
        if (s.src) {
          wait.style.display = "none";
          f.style.display = "block";
          f.src = s.src;
        } else {
          // idle (e.g. fresh \`myx canvas\`): clear any prior content, show the hint
          f.style.display = "none";
          f.removeAttribute("src");
          wait.style.display = "block";
        }
      }
    } catch (e) {}
    setTimeout(tick, 700);
  }
  tick();
</script>
</body>
</html>
`;
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".map": "application/json",
};
export function contentType(p: string): string {
  return MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream";
}

// ── state file (written by `show`, read by the server) ───────────────────────

function readState(): CanvasState {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8")) as CanvasState;
  } catch {
    return { version: 0, kind: "idle", target: "" };
  }
}
function writeState(s: CanvasState): void {
  fs.mkdirSync(canvasDir(), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(s));
}

// ── the localhost canvas server (`myx canvas-serve`) ─────────────────────────

export function serveCanvas(): void {
  const cfg = loadConfig();
  const port = cfg.canvas.port;

  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");

    if (u.pathname === "/health") {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    if (u.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(wrapperHtml());
      return;
    }

    if (u.pathname === "/state") {
      const st = readState();
      let v = String(st.version);
      let src = "";
      if (st.kind === "url") {
        src = st.target;
      } else if (st.kind === "file") {
        let mtime = 0;
        try {
          mtime = fs.statSync(st.target).mtimeMs;
        } catch {
          /* file vanished — fall through with mtime 0 */
        }
        v = `${st.version}.${mtime}`; // mtime in the version ⇒ edits live-reload
        src = `/file/${encodeURIComponent(path.basename(st.target))}?v=${encodeURIComponent(v)}`;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ v, src }));
      return;
    }

    if (u.pathname.startsWith("/file/")) {
      // Serve files from the directory of the currently-shown file so the HTML's
      // sibling assets (./chart.png, ./style.css) resolve. Confined to that dir.
      const st = readState();
      if (st.kind !== "file") {
        res.writeHead(404);
        res.end();
        return;
      }
      const root = path.dirname(st.target);
      const rel = decodeURIComponent(u.pathname.slice("/file/".length));
      const abs = path.resolve(root, rel);
      if (abs !== root && !abs.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(abs, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": contentType(abs), "cache-control": "no-store" });
        res.end(data);
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  // A duplicate server (e.g. a second `myx show` racing to start one) just exits.
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") process.exit(0);
    throw e;
  });
  server.listen(port, "127.0.0.1", () => {
    fs.mkdirSync(canvasDir(), { recursive: true });
    fs.writeFileSync(path.join(canvasDir(), "port"), String(port));
  });
}

// ── window control + the `show` command ──────────────────────────────────────

function osa(script: string): string {
  return execFileSync("osascript", ["-e", script], { encoding: "utf8" }).trim();
}

function screenSize(): { w: number; h: number } {
  try {
    const out = osa(`tell application "Finder" to get bounds of window of desktop`);
    const [, , w, h] = out.split(",").map((s) => parseInt(s.trim(), 10));
    if (w != null && h != null && w > 0 && h > 0) return { w, h };
  } catch {
    /* fall through to a sane default */
  }
  return { w: 1440, h: 900 };
}

/** Start the canvas server (no-op if one is already bound to the port). */
function ensureServer(): void {
  spawn(myxBin(), ["canvas-serve"], { detached: true, stdio: "ignore" }).unref();
  sleepMs(150); // give a fresh server a moment to bind; harmless if already up
}

/** Drop Ghostty out of native fullscreen and tile it to the left half. */
function arrangeGhostty(cfg: MyxConfig): void {
  const { left } = halves(screenSize(), cfg.canvas.split, cfg.canvas.menuBarPx);
  osa(ghosttyTileScript(left));
}

/** Ensure the canvas window exists and is tiled to the right half. */
function ensureCanvasWindow(cfg: MyxConfig): void {
  const url = canvasUrl(cfg);
  const { right } = halves(screenSize(), cfg.canvas.split, cfg.canvas.menuBarPx);
  if (osa(tileCanvasScript(url, right)) === "true") return; // already open → tiled + raised
  spawn(chromeBin(cfg), [`--app=${url}`], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40; i++) {
    sleepMs(100);
    if (osa(tileCanvasScript(url, right)) === "true") return;
  }
}

/** `myx show <file|url>` — point the right-hand canvas at a target and reload it. */
export function show(input: string): void {
  if (process.platform !== "darwin") {
    console.error("myx show: the canvas is macOS-only (it controls a GUI window).");
    process.exit(1);
  }
  if (!input) {
    console.error("usage: myx show <file|url>");
    process.exit(1);
  }
  const cfg = loadConfig();
  const { kind, target } = resolveTarget(input, process.cwd());
  if (kind === "file" && !fs.existsSync(target)) {
    console.error(`myx show: no such file: ${target}`);
    process.exit(1);
  }

  const prev = readState();
  writeState({ version: prev.version + 1, kind, target });
  ensureServer();

  try {
    // Tile Ghostty left (exiting native fullscreen if needed) so the two share
    // the screen — otherwise a fullscreen Ghostty hides the canvas on its own Space.
    if (cfg.canvas.tileSelf) arrangeGhostty(cfg);
    ensureCanvasWindow(cfg);
  } catch {
    console.error(
      "myx show: couldn't control the windows. Grant your terminal\n" +
        "  Automation + Accessibility access (System Settings ▸ Privacy & Security),\n" +
        `  or open ${canvasUrl(cfg)} once manually. The page live-reloads on its own.`,
    );
  }
  console.log(`myx: canvas → ${kind === "url" ? target : path.basename(target)}`);
}

/**
 * `myx canvas` — open the right-hand canvas with no content, ready for the claude
 * session to drive with `myx show`. Same arrangement as `launch --canvas` (tile
 * Ghostty left, idle canvas right) but standalone, so it works from an already-running
 * session without rebuilding the tmux layout.
 */
export function openCanvas(): void {
  if (process.platform !== "darwin") {
    console.error("myx canvas: the canvas is macOS-only (it controls a GUI window).");
    process.exit(1);
  }
  const cfg = loadConfig();
  // Reset to idle so a fresh canvas starts blank even if a file was shown before.
  const prev = readState();
  writeState({ version: prev.version + 1, kind: "idle", target: "" });
  ensureServer();
  try {
    if (cfg.canvas.tileSelf) arrangeGhostty(cfg);
    ensureCanvasWindow(cfg);
  } catch {
    console.error(
      "myx canvas: couldn't control the windows. Grant your terminal\n" +
        "  Automation + Accessibility access (System Settings ▸ Privacy & Security),\n" +
        `  or open ${canvasUrl(cfg)} once manually.`,
    );
  }
  console.log(`myx: canvas ready → ${canvasUrl(cfg)}  (drive it with \`myx show <file|url>\`)`);
}

/** Called by `myx launch --canvas`: tile Ghostty left, then open an idle canvas on the right. */
export function canvasLaunchArrange(cfg: MyxConfig): void {
  if (process.platform !== "darwin") return; // best-effort, macOS only
  if (cfg.canvas.tileSelf) {
    try {
      arrangeGhostty(cfg);
    } catch {
      /* window control not granted yet — non-fatal, user can tile manually */
    }
  }
  if (!fs.existsSync(statePath())) writeState({ version: 1, kind: "idle", target: "" });
  ensureServer();
  try {
    ensureCanvasWindow(cfg);
  } catch {
    /* non-fatal: the window can be opened later by `myx show` */
  }
}
