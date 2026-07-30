import { Command } from "commander";
import { profileChoices } from "../install.js";

/** Registers the read-only catalog profile listing command. */
export function registerProfilesCommand(program: Command, setExitCode: (code: number) => void): void {
  program
    .command("profiles")
    .description("Print available versioned asset profiles")
    .action(() => {
      process.stdout.write(`${JSON.stringify(profileChoices)}\n`);
      setExitCode(0);
    });
}
