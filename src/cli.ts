import { runWidget } from "./widget.ts";
import { launch, canvasCommand } from "./launch.ts";
import { doctor } from "./doctor.ts";
import { statusline, installStatusline } from "./statusline.ts";
import { show, showApp, serveCanvas } from "./canvas.ts";

// Exit quietly when a downstream pipe closes (e.g. `myx doctor | head`).
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const USAGE = `usage: myx <command> [options]

commands:
  widget              render the status widget (default)
  launch              build a new tmux layout and attach (keeps existing sessions)
  canvas              build a new canvas layout: work+widget + GUI canvas (macOS)
  show <file|url>     display a target on the canvas window (macOS); live-reloads
  show-app <AppName>  bring a native app up at the canvas position, e.g. Illustrator (macOS)
  install-statusline  point Claude Code's statusLine at myx (backs up settings)
  statusline          internal: cache official rate limits from Claude Code stdin
  doctor              check environment (tmux, statusLine, config)

options:
  --once              widget: render a single frame and exit
  --no-attach         launch: create the tmux session without attaching
  --canvas            launch: left half = work columns + widget; GUI canvas on the right (macOS)
  --session <name>    launch/canvas: preferred session name, auto-numbered if taken
                      (default: \`session\` in config, "myx")
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // `--session` takes a value, so pull it out before the flag/positional split.
  let session: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--session" || a.startsWith("--session=")) {
      session = a === "--session" ? argv[++i] : a.slice("--session=".length);
      if (!session || session.startsWith("-")) {
        process.stderr.write(`myx: --session requires a name\n\n${USAGE}`);
        process.exit(1);
      }
    } else {
      rest.push(a);
    }
  }

  const flags = new Set(rest.filter((a) => a.startsWith("-")));
  const positionals = rest.filter((a) => !a.startsWith("-"));
  const cmd = positionals[0] ?? "widget";

  switch (cmd) {
    case "widget":
      await runWidget({ once: flags.has("--once") });
      break;
    case "launch":
      launch({
        attach: !flags.has("--no-attach"),
        canvas: flags.has("--canvas"),
        session,
      });
      break;
    case "canvas":
      canvasCommand(session);
      break;
    case "show":
      show(positionals[1] ?? "");
      break;
    case "show-app":
      // App names with spaces survive shell-quoting as one positional; the join is a
      // forgiving fallback for an unquoted `myx show-app Adobe Illustrator`.
      showApp(positionals.slice(1).join(" "));
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
