import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import envPaths from "env-paths";

/**
 * Resolves the durable location for the managed Agent Distro checkout.
 *
 * An explicit environment override always wins. Existing `~/.agent-distro`
 * checkouts remain in place; new installations use the operating system's
 * standard application-data location.
 *
 * @returns Absolute directory that contains the managed `repo` checkout.
 */
export function managedHome() {
  if (process.env.AGENT_DISTRO_HOME) return path.resolve(process.env.AGENT_DISTRO_HOME);
  const legacy = path.join(os.homedir(), ".agent-distro");
  return fs.existsSync(path.join(legacy, "repo")) ? legacy : envPaths("agent-distro", { suffix: "" }).data;
}
