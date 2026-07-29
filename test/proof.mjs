// Small dependency-free smoke proof used by CI and humans after a build. It
// invokes the public launcher and proves install, no-op, conflict, force, and
// dry-run behavior instead of mirroring the current asset list.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-proof-"));
const cli = path.join(root, "bin", "agent-distro.mjs");
execFileSync(process.execPath, [cli, "install", target, "--profile", "debugging"], { stdio: "inherit" });
assert.match(execFileSync(process.execPath, [cli, "verify", target], { encoding: "utf8" }), /Verified [1-9]\d* assets/);
const manifest = fs.readFileSync(path.join(target, ".agent-distro", "manifest.json"));
assert.match(
  execFileSync(process.execPath, [cli, "install", target, "--profile", "debugging"], { encoding: "utf8" }),
  /Synced 0 changed assets/,
);
assert.deepEqual(fs.readFileSync(path.join(target, ".agent-distro", "manifest.json")), manifest);

const owned = JSON.parse(manifest).files.find((file) => file.endsWith(".agent.md"));
assert.ok(owned, "profile must install an agent asset");
const asset = path.join(target, owned);
const original = fs.readFileSync(asset);
fs.writeFileSync(asset, "changed\n");
assert.throws(() =>
  execFileSync(process.execPath, [cli, "install", target, "--profile", "debugging"], { stdio: "pipe" }),
);
execFileSync(process.execPath, [cli, "install", target, "--profile", "debugging", "--force"], { stdio: "inherit" });
assert.deepEqual(fs.readFileSync(asset), original);
assert.match(execFileSync(process.execPath, [cli, "verify", target], { encoding: "utf8" }), /Verified [1-9]\d* assets/);
const beforeDryRun = fs.readFileSync(path.join(target, ".agent-distro", "manifest.json"));
execFileSync(process.execPath, [cli, "install", target, "--profile", "debugging", "--dry-run"], { stdio: "inherit" });
assert.deepEqual(fs.readFileSync(path.join(target, ".agent-distro", "manifest.json")), beforeDryRun);

console.log("Node install proof passed: selected profile lifecycle is safe.");
