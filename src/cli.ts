import { runWidget } from "./index.ts";
import { launch } from "./launch.ts";
import { doctor } from "./doctor.ts";

const USAGE = `usage: myx <command> [options]

commands:
  widget            render the status widget (default)
  launch            build the tmux layout and attach
  doctor            check environment (tmux, ccusage, config)

options:
  --once            widget: render a single frame and exit
  --no-attach       launch: create the tmux session without attaching
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  const cmd = argv.find((a) => !a.startsWith("-")) ?? "widget";

  switch (cmd) {
    case "widget":
      await runWidget({ once: flags.has("--once") });
      break;
    case "launch":
      launch({ attach: !flags.has("--no-attach") });
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
