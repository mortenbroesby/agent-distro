#!/usr/bin/env node
/**
 * Updates the managed checkout, then delegates packaging and global install to
 * bootstrap. `upgrade` changes Agent Distro itself; `install` updates assets in
 * a user-selected repository.
 */
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
    // Bootstrap can clone a detached CI checkout. Fetching the remote HEAD and
    // fast-forwarding FETCH_HEAD works for both detached and branch checkouts.
    const fetch = spawnSync("git", ["-C", root, "fetch", "origin", "HEAD"], { stdio: "inherit" });
    const merge =
      fetch.error || fetch.status !== 0
        ? undefined
        : spawnSync("git", ["-C", root, "merge", "--ff-only", "FETCH_HEAD"], { stdio: "inherit" });
    if (!merge || merge.error || merge.status !== 0) process.exitCode = 1;
    else {
      // Reuse bootstrap so upgrade and first-time setup share the exact packed
      // artifact, global-install, and smoke-check behavior.
      const bootstrap = path.join(root, "scripts", "bootstrap.mjs");
      const result = spawnSync(process.execPath, [bootstrap, "--home", home], { stdio: "inherit" });
      if (result.error || result.status !== 0) process.exitCode = 1;
    }
  }
}
