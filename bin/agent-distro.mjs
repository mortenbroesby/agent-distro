#!/usr/bin/env node
// Minimal npm bin launcher: delegates all behavior to the built library and
// converts an unexpected boundary failure into the stable CLI error format.
import { formatFailure, run } from "../dist/agent-distro.mjs";

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error(formatFailure("AGENT_DISTRO_E_UNEXPECTED", error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
