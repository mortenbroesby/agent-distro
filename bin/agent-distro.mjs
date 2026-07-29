#!/usr/bin/env node
import { formatFailure, run } from "../dist/cli.mjs";

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error(formatFailure("AGENT_DISTRO_E_UNEXPECTED", error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
