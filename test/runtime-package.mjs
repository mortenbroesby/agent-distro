// Packed-runtime proof: install the already-built npm artifact with the active
// Node version, then exercise its public binary without source-build tooling.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const archive = process.argv[2];
if (!archive || !fs.existsSync(archive)) throw new Error("Pass an existing npm package archive.");

const npmCli =
  process.platform === "win32"
    ? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    : "npm";
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-runtime-"));
const consumer = path.join(workspace, "consumer");
const target = path.join(workspace, "target with spaces-å");

/** Runs the npm CLI without introducing a platform shell or its quoting rules. */
function runNpm(args) {
  // Node cannot execute npm.cmd directly, and CMD would split the deliberately
  // space-containing fixture path. npm's JavaScript entry point avoids both.
  if (process.platform === "win32") assert.ok(fs.existsSync(npmCli), `Missing npm CLI: ${npmCli}`);
  return execFileSync(
    process.platform === "win32" ? process.execPath : npmCli,
    process.platform === "win32" ? [npmCli, ...args] : args,
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  );
}

try {
  fs.mkdirSync(target, { recursive: true });
  runNpm(["install", "--prefix", consumer, "--ignore-scripts", "--no-audit", "--no-fund", archive]);
  runNpm(["exec", "--prefix", consumer, "--", "agent-distro", "install", target, "--profile", "debugging"]);
  const verified = runNpm(["exec", "--prefix", consumer, "--", "agent-distro", "doctor", target]);
  assert.match(verified, /Verified [1-9]\d* assets/);
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
