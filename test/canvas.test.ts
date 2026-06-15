import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  contentType,
  ghosttyTileScript,
  halves,
  resolveTarget,
  resolveUnderRoot,
  tileCanvasScript,
  wrapperHtml,
} from "../src/canvas.ts";

test("halves: left/right split the screen with a menu-bar top margin", () => {
  const { left, right } = halves({ w: 1000, h: 800 }, 0.5, 25);
  assert.deepEqual(left, { x: 0, y: 25, w: 500, h: 775 });
  assert.deepEqual(right, { x: 500, y: 25, w: 500, h: 775 });
  // right starts exactly where left ends; widths cover the full screen
  assert.equal(left.x + left.w, right.x);
  assert.equal(left.w + right.w, 1000);
});

test("halves: split fraction shifts the divider and rounds to whole pixels", () => {
  const { left, right } = halves({ w: 999, h: 600 }, 0.4, 0);
  assert.equal(left.w, Math.round(999 * 0.4)); // 400
  assert.equal(left.w + right.w, 999); // no gap from rounding
  assert.equal(left.y, 0);
});

test("resolveTarget: http(s) passes through as a url", () => {
  assert.deepEqual(resolveTarget("https://example.com/x", "/tmp"), {
    kind: "url",
    target: "https://example.com/x",
  });
});

test("resolveTarget: a relative path resolves to an absolute file against cwd", () => {
  assert.deepEqual(resolveTarget("./report.html", "/work/dir"), {
    kind: "file",
    target: path.resolve("/work/dir", "report.html"),
  });
});

test("resolveTarget: a file:// url becomes a plain path", () => {
  assert.deepEqual(resolveTarget("file:///a/b/c.html", "/tmp"), {
    kind: "file",
    target: "/a/b/c.html",
  });
});

test("tileCanvasScript: guards on Chrome running, matches by url, sets bounds, returns a flag", () => {
  const s = tileCanvasScript("http://127.0.0.1:7842/", { x: 500, y: 25, w: 400, h: 775 });
  assert.match(s, /application "Google Chrome" is running/);
  assert.match(s, /starts with "http:\/\/127\.0\.0\.1:7842\/"/);
  // bounds are {left, top, right, bottom} = {x, y, x+w, y+h}
  assert.match(s, /set bounds of win to \{500, 25, 900, 800\}/);
  assert.match(s, /return didTile/);
});

test("ghosttyTileScript: tiles a named app's front window via System Events", () => {
  const s = ghosttyTileScript({ x: 0, y: 25, w: 500, h: 775 });
  assert.match(s, /System Events/);
  assert.match(s, /process "Ghostty"/);
  assert.match(s, /set position of front window to \{0, 25\}/);
  assert.match(s, /set size of front window to \{500, 775\}/);
  // drops out of native fullscreen first (otherwise it owns its own Space)
  assert.match(s, /AXFullScreen.*is true/);
  assert.match(s, /set value of attribute "AXFullScreen" of front window to false/);
});

test("contentType: maps known extensions and falls back to octet-stream", () => {
  assert.equal(contentType("/a/b.html"), "text/html");
  assert.equal(contentType("/a/b.PNG"), "image/png");
  assert.equal(contentType("/a/b.svg"), "image/svg+xml");
  assert.equal(contentType("/a/b.unknownext"), "application/octet-stream");
});

test("wrapperHtml: polls /state and drives an iframe", () => {
  const html = wrapperHtml();
  assert.match(html, /fetch\("\/state"/);
  assert.match(html, /<iframe id="f"/);
  assert.match(html, /myx show/); // the idle hint
});

test("resolveUnderRoot: sibling and nested assets resolve under the shown file's dir", () => {
  assert.equal(resolveUnderRoot("/work", "chart.png"), path.resolve("/work", "chart.png"));
  assert.equal(
    resolveUnderRoot("/work", "assets/app.css"),
    path.resolve("/work", "assets/app.css"),
  );
});

test("resolveUnderRoot: the root dir itself is allowed", () => {
  assert.equal(resolveUnderRoot("/work", "."), "/work");
});

test("resolveUnderRoot: a ../ traversal escaping root is rejected", () => {
  assert.equal(resolveUnderRoot("/work", "../etc/passwd"), null);
});

test("resolveUnderRoot: an absolute path escaping root is rejected", () => {
  assert.equal(resolveUnderRoot("/work", "/etc/passwd"), null);
});

test("resolveUnderRoot: a sibling dir sharing root's name prefix is not treated as inside", () => {
  // "/work-secret" starts with "/work" textually but is not under "/work/"
  assert.equal(resolveUnderRoot("/work", "../work-secret/x"), null);
});
