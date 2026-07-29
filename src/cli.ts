import { Command, CommanderError } from "commander";
import { diagnostics, verify } from "./doctor.js";
import { fail, formatFailure } from "./errors.js";
import { assetChoices, install, interactiveInstall, profileChoices, recover } from "./install.js";
import { reportIssue } from "./report-issue.js";
import { version } from "./package.js";

/**
 * Runs the Commander-based CLI without terminating the Node process.
 *
 * Keeping process exit outside this function lets tests and package launchers
 * reuse the exact command contract while callers decide how to handle the
 * resulting exit code.
 */
export async function run(args: string[]) {
  let exitCode = 0;
  const program = new Command()
    .name("agent-distro")
    .description("Install and verify Agent Distro assets")
    .version(version)
    .showHelpAfterError()
    .exitOverride();

  program.command("verify <target>").description("Verify installed Agent Distro assets").action((target) => { exitCode = verify(target); });
  program.command("recover <target>").description("Restore an interrupted Agent Distro installation").action((target) => { exitCode = recover(target); });
  program.command("diagnostics <target>").description("Print a safe read-only diagnostics snapshot").action((target) => { exitCode = diagnostics(target); });
  program.command("report-issue")
    .description("Print a pre-filled GitHub issue URL without submitting it")
    .option("--diagnostics-consent", "confirm that the sanitized summary may be included")
    .requiredOption("--message <summary>", "sanitized failure summary")
    .option("--action <name>", "command that failed")
    .option("--code <code>", "Agent Distro failure code")
    .action((options) => { exitCode = reportIssue(options); });
  // No selection flags means a human is asking for the guided TTY journey.
  // Scripts must choose assets explicitly so they cannot block on prompts.
  program.command("profiles").description("Print available versioned asset profiles").action(() => {
    process.stdout.write(`${JSON.stringify(profileChoices)}\n`);
  });
  program.command("install [target]")
    .description("Install into any directory; interactively select assets, or use --asset/--all for scripts")
    .option("--force", "replace changed Agent Distro assets")
    .option("--dry-run", "show changes without writing")
    .option("--asset <path...>", "asset path to install; repeatable")
    .option("--profile <name...>", "profile to install; repeatable and composable with --asset")
    .option("--all", "install every Agent Distro asset")
    .option("--interactive", "open the selection wizard")
    .action(async (target, options) => {
      if (options.interactive || (!options.asset && !options.profile && !options.all)) {
        exitCode = await interactiveInstall(target);
      } else if (!target) {
        exitCode = fail("AGENT_DISTRO_E_USAGE", "A target directory is required with --asset or --all.");
      } else if ((options.asset || options.profile) && options.all) {
        exitCode = fail("AGENT_DISTRO_E_USAGE", "Use --all or selected --profile/--asset values, not both.");
      } else {
        try {
          exitCode = install(target, { ...options, profiles: options.profile, selected: options.all ? assetChoices.map(([value]) => value) : options.asset });
        } catch (error) {
          exitCode = fail("AGENT_DISTRO_E_USAGE", error instanceof Error ? error.message : String(error));
        }
      }
    });

  // Bare invocation is help, rather than an implicit filesystem mutation.
  if (args.length === 0) {
    program.outputHelp();
    return 1;
  }
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return 0;
      console.error(formatFailure("AGENT_DISTRO_E_USAGE", error.message));
      return error.exitCode;
    }
    throw error;
  }
  return exitCode;
}
