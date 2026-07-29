import { Command } from "commander";
import { fail } from "../errors.js";
import { assetChoices, install, interactiveInstall, recover } from "../install.js";

/** Registers recovery without owning process exit. */
export function registerRecoveryCommand(program: Command, setExitCode: (code: number) => void): void {
  program
    .command("recover <target>")
    .description("Restore an interrupted Agent Distro installation")
    .action((target) => {
      setExitCode(recover(target));
    });
}

/** Registers installation without owning process exit. */
export function registerInstallCommand(program: Command, setExitCode: (code: number) => void): void {
  // No selection flags means a human is asking for the guided TTY journey.
  // Scripts must choose assets explicitly so they cannot block on prompts.
  program
    .command("install [target]")
    .description("Install into any directory; interactively select assets, or use --asset/--all for scripts")
    .option("--force", "replace changed Agent Distro assets")
    .option("--dry-run", "show changes without writing")
    .option("--verbose", "print concise installation phases to stderr")
    .option("--asset <path...>", "asset path to install; repeatable")
    .option("--profile <name...>", "profile to install; repeatable and composable with --asset")
    .option("--all", "install every Agent Distro asset")
    .option("--interactive", "open the selection wizard")
    .action(async (target, options) => {
      if (options.interactive || (!options.asset && !options.profile && !options.all)) {
        setExitCode(await interactiveInstall(target));
      } else if (!target) {
        setExitCode(fail("AGENT_DISTRO_E_USAGE", "A target directory is required with --asset or --all."));
      } else if ((options.asset || options.profile) && options.all) {
        setExitCode(fail("AGENT_DISTRO_E_USAGE", "Use --all or selected --profile/--asset values, not both."));
      } else {
        try {
          setExitCode(
            install(target, {
              force: options.force,
              dryRun: options.dryRun,
              profiles: options.profile,
              selected: options.all ? assetChoices.map(([value]) => value) : options.asset,
              onStep: options.verbose ? (message) => process.stderr.write(`[agent-distro] ${message}\n`) : undefined,
            }),
          );
        } catch (error) {
          setExitCode(fail("AGENT_DISTRO_E_USAGE", error instanceof Error ? error.message : String(error)));
        }
      }
    });
}
