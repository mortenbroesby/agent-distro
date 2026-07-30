import { Command } from "commander";
import { fail } from "../errors.js";
import { assetChoices, install, readManagedSelection, recover } from "../install.js";
import { interactiveInstall } from "../interactive-install.js";

/**
 * Registers recovery without allowing the command adapter to terminate Node.
 *
 * @param program - Commander program that owns parsing and user-facing help.
 * @param setExitCode - Receives the recovery result for the shared CLI runner.
 */
export function registerRecoveryCommand(program: Command, setExitCode: (code: number) => void): void {
  program
    .command("recover <target>")
    .description("Restore an interrupted Agent Distro installation")
    .action((target) => {
      setExitCode(recover(target));
    });
}

/**
 * Registers the install and update command family without owning process exit.
 *
 * @param program - Commander program that owns parsing and user-facing help.
 * @param setExitCode - Receives each asynchronous command result.
 * @remarks Both commands delegate filesystem safety to `install`. This adapter
 * only distinguishes interactive human intent from explicit script intent and
 * chooses whether an existing persisted selection should be prefilled.
 */
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
      // This warning is advisory. The core installer remains responsible for
      // manifest validation, so malformed state still takes the safe path.
      if (target) {
        try {
          if (readManagedSelection(target))
            console.error("Agent Distro is already installed here; use update to revise it.");
        } catch {
          // Install will report malformed target state through its normal path.
        }
      }
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

  program
    .command("update [target]")
    .description("Revise the selected assets in an existing Agent Distro installation")
    .option("--force", "replace changed Agent Distro assets")
    .option("--dry-run", "show changes without writing")
    .option("--asset <path...>", "asset path to install; repeatable")
    .option("--profile <name...>", "profile to install; repeatable and composable with --asset")
    .option("--all", "install every Agent Distro asset")
    .option("--interactive", "open the selection wizard")
    .action(async (target, options) => {
      const destination = target ?? process.cwd();
      let initial;
      try {
        // Update is meaningful only for a known target. Reading selection first
        // also supplies the TUI defaults without trusting arbitrary files.
        initial = readManagedSelection(destination);
      } catch (error) {
        setExitCode(fail("AGENT_DISTRO_E_MANIFEST_INVALID", error instanceof Error ? error.message : String(error)));
        return;
      }
      if (!initial) {
        setExitCode(fail("AGENT_DISTRO_E_USAGE", "No Agent Distro installation found; run install first."));
        return;
      }
      if (options.interactive || (!options.asset && !options.profile && !options.all)) {
        setExitCode(await interactiveInstall(destination, initial));
      } else if ((options.asset || options.profile) && options.all) {
        setExitCode(fail("AGENT_DISTRO_E_USAGE", "Use --all or selected --profile/--asset values, not both."));
      } else {
        try {
          // Explicit flags replace the corresponding persisted dimension;
          // omitted flags retain it, so a scripted update is predictable.
          setExitCode(
            install(destination, {
              force: options.force,
              dryRun: options.dryRun,
              profiles: options.profile ?? initial.profiles,
              selected: options.all ? assetChoices.map(([value]) => value) : (options.asset ?? initial.assets),
            }),
          );
        } catch (error) {
          setExitCode(fail("AGENT_DISTRO_E_USAGE", error instanceof Error ? error.message : String(error)));
        }
      }
    });
}
