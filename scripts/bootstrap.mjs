#!/usr/bin/env node
// Builds, packs, installs, and invokes the same global CLI artifact users receive.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const [major, minor, patch] = process.versions.node.split(".").map(Number);
const args = process.argv.slice(2);
const environment = { ...process.env };
if (environment.NPM_CONFIG_PREFIX) delete environment.npm_config_prefix;

function usage() {
  console.error("Usage: node scripts/bootstrap.mjs [--doctor <target>]");
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: root, env: environment, stdio: "inherit", ...options });
  if (result.error) console.error(result.error.message);
  return result;
}

function main() {
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--doctor" || !args[1])) {
    usage();
    return 1;
  }
  if (major !== 22 || minor < 23 || (minor === 23 && patch < 1)) {
    console.error("Agent Distro requires Node 22.23.1 or newer within Node 22.");
    return 1;
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-bootstrap-"));
  try {
    if (run(npm, ["ci"]).status !== 0) return 1;
    const packed = run(npm, ["pack", "--json", "--silent", "--pack-destination", temporary], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    });
    if (packed.error || packed.status !== 0) return 1;

    let result;
    try {
      const jsonStart = packed.stdout.search(/^\[/m);
      result = JSON.parse(packed.stdout.slice(jsonStart));
    } catch {
      console.error("npm pack returned invalid JSON.");
      return 1;
    }
    if (!Array.isArray(result) || result.length !== 1 || typeof result[0]?.filename !== "string") {
      console.error("npm pack did not return exactly one archive.");
      return 1;
    }
    const archive = path.resolve(temporary, result[0].filename);
    if (path.dirname(archive) !== temporary || !fs.existsSync(archive)) {
      console.error("npm pack returned an invalid archive path.");
      return 1;
    }
    if (run(npm, ["install", "--global", "--no-audit", "--no-fund", archive]).status !== 0) return 1;

    const configuredPrefix = run(npm, ["prefix", "--global"], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    });
    if (configuredPrefix.error || configuredPrefix.status !== 0 || !configuredPrefix.stdout.trim()) return 1;
    const prefix = configuredPrefix.stdout.trim();
    const executable = path.join(prefix, process.platform === "win32" ? "agent-distro.cmd" : "bin/agent-distro");
    return run(executable, args.length === 0 ? ["--help"] : ["doctor", args[1]], { cwd: process.cwd() }).status === 0
      ? 0
      : 1;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

process.exitCode = main();
