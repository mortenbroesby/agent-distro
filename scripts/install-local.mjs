#!/usr/bin/env node
// Cross-platform bootstrap for running the checked-out CLI against one target.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const [major, minor, patch] = process.versions.node.split(".").map(Number);

function usage() {
  console.error("Usage: node scripts/install-local.mjs <target> [agent-distro install options]");
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  return result.status === 0 && !result.error;
}

if (process.argv.length < 3) {
  usage();
  process.exitCode = 1;
} else if (major !== 22 || minor < 23 || (minor === 23 && patch < 1)) {
  console.error("Agent Distro requires Node 22.23.1 or newer within Node 22.");
  process.exitCode = 1;
} else if (!run(npm, ["ci"]) || !run(npm, ["run", "build"])) {
  process.exitCode = 1;
} else if (!run(process.execPath, [path.join(root, "bin", "agent-distro.mjs"), "install", ...process.argv.slice(2)])) {
  process.exitCode = 1;
}
