#!/usr/bin/env node
/**
 * Minimal npm bin launcher. It delegates to the built library and converts an
 * unexpected boundary failure into the stable CLI error format. Upgrade stays
 * separate because it intentionally operates on the managed source checkout.
 */
if (process.argv[2] === "upgrade") {
  await import("../scripts/upgrade.mjs");
} else {
  const { formatFailure, run } = await import("../dist/agent-distro.mjs");

  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(formatFailure("AGENT_DISTRO_E_UNEXPECTED", error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
