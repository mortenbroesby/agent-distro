// Packed-runtime proof: install the already-built npm artifact with the active
// Node version, then exercise its public binary without source-build tooling.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const archive = process.argv[2];
if (!archive || !fs.existsSync(archive)) throw new Error("Pass an existing npm package archive.");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-runtime-"));
const consumer = path.join(workspace, "consumer");
const target = path.join(workspace, "target with spaces-å");

/** Runs npm without shell parsing so Windows and POSIX launchers share one proof. */
function runNpm(args) {
  return execFileSync(npm, args, { encoding: "utf8", stdio: "pipe" });
}

try {
  fs.mkdirSync(target, { recursive: true });
  runNpm(["install", "--prefix", consumer, "--ignore-scripts", "--no-audit", "--no-fund", archive]);
  runNpm(["exec", "--prefix", consumer, "--", "agent-distro", "install", target, "--profile", "debugging"]);
  const verified = runNpm(["exec", "--prefix", consumer, "--", "agent-distro", "verify", target]);
  assert.match(verified, /Verified [1-9]\d* assets/);
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
