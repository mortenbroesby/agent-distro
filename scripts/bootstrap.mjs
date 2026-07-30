#!/usr/bin/env node
// Creates a managed checkout, then installs the same packed global CLI users receive.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Windows command shims require a shell, so invoke npm's JavaScript entrypoint
// with Node and keep every path and user argument out of shell parsing.
const npmCli =
  process.platform === "win32"
    ? (process.env.npm_execpath ??
      path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"))
    : undefined;
const [major, minor] = process.versions.node.split(".").map(Number);
const args = process.argv.slice(2);
const environment = { ...process.env };
if (environment.NPM_CONFIG_PREFIX) delete environment.npm_config_prefix;
let home = process.env.AGENT_DISTRO_HOME
  ? path.resolve(process.env.AGENT_DISTRO_HOME)
  : path.join(os.homedir(), ".agent-distro");
let doctorTarget;

function usage() {
  console.error("Usage: bin/agent-distro bootstrap [--home <directory>] [--doctor [target]]");
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { env: environment, stdio: "inherit", ...options });
  if (result.error) console.error(result.error.message);
  return result;
}

function runNpm(commandArgs, options = {}) {
  return run(npmCli ? process.execPath : "npm", npmCli ? [npmCli, ...commandArgs] : commandArgs, options);
}

function parseArgs() {
  const values = args[0] === "bootstrap" ? args.slice(1) : args;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--home" && values[index + 1]) {
      home = path.resolve(values[++index]);
    } else if (values[index] === "--doctor" && values[index + 1] && !values[index + 1].startsWith("-")) {
      doctorTarget = values[++index];
    } else {
      usage();
      return false;
    }
  }
  return true;
}

function managedRoot() {
  const destination = path.join(home, "repo");
  if (fs.existsSync(destination)) {
    if (!fs.statSync(destination).isDirectory()) throw new Error(`Managed checkout is not a directory: ${destination}`);
    return destination;
  }
  fs.mkdirSync(home, { recursive: true });
  const cloned = run("git", ["clone", "--no-hardlinks", sourceRoot, destination]);
  if (cloned.error || cloned.status !== 0) throw new Error("Could not create the managed checkout.");
  return destination;
}

function main() {
  if (!parseArgs()) return 1;
  if (!((major === 22 && minor >= 18) || (major >= 24 && major < 27 && (major > 24 || minor >= 11)))) {
    console.error(
      "Building Agent Distro from this checkout requires Node ^22.18.0 or >=24.11.0 <27 (tsdown build requirement). The packed CLI supports Node >=20.12.0 <27.",
    );
    return 1;
  }

  let root;
  try {
    root = managedRoot();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const buildTool = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsdown.cmd" : "tsdown");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-bootstrap-"));
  try {
    // Do not replace an active checkout's dependencies: a running test or
    // editor can hold native build tooling open on Windows. A fresh checkout
    // still receives its locked dependencies before packaging.
    if (!fs.existsSync(buildTool) && runNpm(["ci"], { cwd: root }).status !== 0) return 1;
    const packed = runNpm(["pack", "--json", "--silent", "--pack-destination", temporary], {
      cwd: root,
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
    if (runNpm(["install", "--global", "--force", "--ignore-scripts", archive]).status !== 0) return 1;

    const globalRoot = runNpm(["root", "--global"], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    });
    if (globalRoot.error || globalRoot.status !== 0 || !globalRoot.stdout.trim()) return 1;
    const executable = path.join(globalRoot.stdout.trim(), "agent-distro", "bin", "agent-distro.mjs");
    return run(
      process.execPath,
      [executable, ...(doctorTarget === undefined ? ["--help"] : ["doctor", doctorTarget])],
      {
        cwd: process.cwd(),
      },
    ).status === 0
      ? 0
      : 1;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

process.exitCode = main();
