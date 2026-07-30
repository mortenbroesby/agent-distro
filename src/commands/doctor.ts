import { Command } from "commander";
import { diagnostics, verify } from "../doctor.js";

/** Registers the read-only verification and diagnostics command. */
export function registerDoctorCommand(program: Command, setExitCode: (code: number) => void): void {
  program
    .command("doctor [target]")
    .option("--diagnostics", "print a safe read-only diagnostics snapshot")
    .action((target, options) => {
      setExitCode(options.diagnostics ? diagnostics(target ?? process.cwd()) : verify(target ?? process.cwd()));
    });
}
