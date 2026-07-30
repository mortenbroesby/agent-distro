import { Command, CommanderError } from "commander";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerInstallCommand, registerRecoveryCommand } from "./commands/install.js";
import { registerProfilesCommand } from "./commands/profiles.js";
import { registerReportIssueCommand } from "./commands/report-issue.js";
import { formatFailure } from "./errors.js";
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

  registerDoctorCommand(program, (code) => {
    exitCode = code;
  });
  registerRecoveryCommand(program, (code) => {
    exitCode = code;
  });
  registerReportIssueCommand(program, (code) => {
    exitCode = code;
  });
  registerProfilesCommand(program, (code) => {
    exitCode = code;
  });
  registerInstallCommand(program, (code) => {
    exitCode = code;
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
