import { Command } from "commander";
import { reportIssue } from "../report-issue.js";

/**
 * Registers the local, consent-gated issue URL command.
 *
 * @param program - Commander program that owns user-facing help and parsing.
 * @param setExitCode - Receives the result without terminating the process.
 * @remarks The handler delegates only URL construction; it never performs a
 * network request or opens a browser on the user's behalf.
 */
export function registerReportIssueCommand(program: Command, setExitCode: (code: number) => void): void {
  program
    .command("report-issue")
    .description("Print a pre-filled GitHub issue URL without submitting it")
    .option("--diagnostics-consent", "confirm that the sanitized summary may be included")
    .requiredOption("--message <summary>", "sanitized failure summary")
    .option("--action <name>", "command that failed")
    .option("--code <code>", "Agent Distro failure code")
    .action((options) => {
      setExitCode(reportIssue(options));
    });
}
