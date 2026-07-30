import { Command } from "commander";
import { diagnostics, doctor } from "../doctor.js";

/**
 * Registers the read-only verification and diagnostics command.
 *
 * @param program - Commander program that owns user-facing help and parsing.
 * @param setExitCode - Receives the result without terminating the process.
 * @remarks `--json` remains an alias for diagnostics so CI has one stable,
 * path-safe machine-readable contract.
 */
export function registerDoctorCommand(program: Command, setExitCode: (code: number) => void): void {
  program
    .command("doctor [target]")
    .option("--diagnostics", "print a safe read-only diagnostics snapshot")
    .option("--json", "print a safe read-only JSON diagnostics snapshot")
    .action((target, options) => {
      setExitCode(
        options.diagnostics || options.json ? diagnostics(target ?? process.cwd()) : doctor(target ?? process.cwd()),
      );
    });
}
