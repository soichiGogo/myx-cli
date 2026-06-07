import { runWidget } from "./index.ts";
import { launch } from "./launch.ts";
import { doctor } from "./doctor.ts";
import { statusline, installStatusline } from "./statusline.ts";

// Exit quietly when a downstream pipe closes (e.g. `myx doctor | head`).
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const USAGE = `usage: myx <command> [options]

commands:
  widget              render the status widget (default)
  launch              build the tmux layout and attach
  install-statusline  point Claude Code's statusLine at myx (backs up settings)
  statusline          internal: cache official rate limits from Claude Code stdin
  doctor              check environment (tmux, statusLine, config)

options:
  --once              widget: render a single frame and exit
  --no-attach         launch: create the tmux session without attaching
  --fresh             launch: kill an existing session first, then rebuild
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
      launch({ attach: !flags.has("--no-attach"), fresh: flags.has("--fresh") });
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
