#!/usr/bin/env node
// Updates the managed checkout, then lets bootstrap repack and reinstall it.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(3);
let home = process.env.AGENT_DISTRO_HOME
  ? path.resolve(process.env.AGENT_DISTRO_HOME)
  : path.join(os.homedir(), ".agent-distro");

if (args.length === 2 && args[0] === "--home") home = path.resolve(args[1]);
else if (args.length !== 0) {
  console.error("Usage: agent-distro upgrade [--home <directory>]");
  process.exitCode = 1;
} else {
  const root = path.join(home, "repo");
  if (!fs.existsSync(path.join(root, ".git"))) {
    console.error(`No managed Agent Distro checkout found at ${root}. Run bin/agent-distro bootstrap first.`);
    process.exitCode = 1;
  } else {
    const pull = spawnSync("git", ["-C", root, "pull", "--ff-only"], { stdio: "inherit" });
    if (pull.error || pull.status !== 0) process.exitCode = 1;
    else {
      const bootstrap = path.join(root, "scripts", "bootstrap.mjs");
      const result = spawnSync(process.execPath, [bootstrap, "--home", home], { stdio: "inherit" });
      if (result.error || result.status !== 0) process.exitCode = 1;
    }
  }
}
