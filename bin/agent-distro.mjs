#!/usr/bin/env node
/**
 * Minimal npm bin launcher. It delegates to the built library and converts an
 * unexpected boundary failure into the stable CLI error format. Upgrade stays
 * separate because it intentionally operates on the managed source checkout.
 */
const [major] = process.versions.node.split(".").map(Number);
const supported = major === 22 || major === 24 || major === 26;

if (!supported) {
  // Stop before importing commands so an unsupported runtime cannot mutate a target.
  console.error("Agent Distro requires Node 22, 24, or 26. Upgrade Node before running Agent Distro.");
  process.exitCode = 1;
} else if (process.argv[2] === "upgrade") {
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
