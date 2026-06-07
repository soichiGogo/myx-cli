// ANSI escape helpers for the widget's terminal output. Centralized here so the
// raw escape sequences live in one place instead of scattered string literals.

const ESC = "\x1b";
const RESET = `${ESC}[0m`;

const FG = {
  green: 32,
  yellow: 33,
  red: 31,
} as const;

export type Color = keyof typeof FG;

/** Wrap `s` in the given foreground color, auto-resetting afterwards. */
export function color(s: string, name: Color): string {
  return `${ESC}[${FG[name]}m${s}${RESET}`;
}

/** Wrap `s` in dim/faint, auto-resetting afterwards. */
export function dim(s: string): string {
  return `${ESC}[2m${s}${RESET}`;
}

/** Cursor visibility controls for the render loop. */
export const cursor = {
  hide: `${ESC}[?25l`,
  show: `${ESC}[?25h`,
} as const;

/** Clear the screen and move the cursor home, before drawing a frame. */
export const clearHome = `${ESC}[H${ESC}[2J`;
