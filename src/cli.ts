import { runWidget } from "./widget.ts";
import { launch, reshapeToCanvasWindow } from "./launch.ts";
import { doctor } from "./doctor.ts";
import { statusline, installStatusline } from "./statusline.ts";
import { show, openCanvas, serveCanvas } from "./canvas.ts";

// Exit quietly when a downstream pipe closes (e.g. `myx doctor | head`).
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const USAGE = `usage: myx <command> [options]

commands:
  widget              render the status widget (default)
  launch              build the tmux layout and attach
  canvas              open an empty GUI canvas on the right half (macOS)
  show <file|url>     display a target on the canvas window (macOS); live-reloads
  install-statusline  point Claude Code's statusLine at myx (backs up settings)
  statusline          internal: cache official rate limits from Claude Code stdin
  doctor              check environment (tmux, statusLine, config)

options:
  --once              widget: render a single frame and exit
  --no-attach         launch: create the tmux session without attaching
  --fresh             launch: kill an existing session first, then rebuild
  --canvas            launch: single left column + a GUI canvas on the right half (macOS)
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  const positionals = argv.filter((a) => !a.startsWith("-"));
  const cmd = positionals[0] ?? "widget";

  switch (cmd) {
    case "widget":
      await runWidget({ once: flags.has("--once") });
      break;
    case "launch":
      launch({
        attach: !flags.has("--no-attach"),
        fresh: flags.has("--fresh"),
        canvas: flags.has("--canvas"),
      });
      break;
    case "canvas":
      reshapeToCanvasWindow(); // tmux: collapse this window to work + widget
      openCanvas(); // GUI: tile Ghostty left, empty canvas right
      break;
    case "show":
      show(positionals[1] ?? "");
      break;
    case "canvas-serve":
      serveCanvas();
      break;
    case "statusline":
      statusline();
      break;
    case "install-statusline":
      installStatusline();
      break;
    case "doctor":
      doctor();
      break;
    case "help":
    case "--help":
      process.stdout.write(USAGE);
      break;
    default:
      process.stderr.write(`myx: unknown command '${cmd}'\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
