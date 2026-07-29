// End-to-end consumer proof: npm packs this project, installs it into a fresh
// consumer, and runs its public binary against real filesystem repository shapes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { expect } from "vitest";
import { test } from "./support/repository-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

test("installs the packed npm binary into real repository shapes", async ({ repository }) => {
  const workspace = repository.root;
  const cache = path.join(workspace, "cache");
  const env = { ...process.env, NPM_CONFIG_CACHE: cache, npm_config_cache: cache };
  await execa(npm, ["pack", "--pack-destination", workspace], { cwd: root, env });
  const archive = fs.readdirSync(workspace).find((file) => file.endsWith(".tgz"));
  const consumer = path.join(workspace, "consumer");
  await execa(npm, ["install", "--prefix", consumer, "--ignore-scripts", "--no-audit", "--no-fund", path.join(workspace, archive)], { env });
  const execute = (args, options) => execa(npm, ["exec", "--prefix", consumer, "--", "agent-distro", ...args], options);
  expect((await execute(["--version"])).stdout).toBe("0.0.0");

  // Spaces and Unicode make launcher and path handling failures visible on both
  // supported platforms without relying on a synthetic filesystem.
  const plain = repository.plain("target with spaces-å");
  await execute(["install", plain, "--all"]);
  expect((await execute(["verify", plain])).stdout).toMatch(/Verified [1-9]\d* assets/);

  // An existing matching installation is a true no-op: no force, staging, or
  // ownership rewrite is needed when the selected profile has not changed.
  const priorInstall = repository.plain("prior installation");
  await execute(["install", priorInstall, "--profile", "debugging"]);
  const manifest = fs.readFileSync(path.join(priorInstall, ".agent-distro", "manifest.json"));
  expect((await execute(["install", priorInstall, "--profile", "debugging"])).stdout).toContain("Synced 0 changed assets");
  expect(fs.readFileSync(path.join(priorInstall, ".agent-distro", "manifest.json"))).toEqual(manifest);
  expect(fs.readdirSync(path.join(priorInstall, ".agent-distro")).some((name) => name.startsWith(".agent-distro-stage-"))).toBe(false);
  const debugging = repository.plain("debugging profile");
  await execute(["install", debugging, "--profile", "debugging"]);
  expect((await execute(["verify", debugging])).stdout).toMatch(/Verified [1-9]\d* assets/);

  // Git state is deliberately incidental: the installer targets only the exact
  // directory supplied, including a nested package within a monorepo.
  const git = await repository.git();
  await execute(["install", git, "--asset", ".mcp.json"]);
  expect((await execute(["verify", git])).stdout).toMatch(/Verified [1-9]\d* assets/);
  const monorepo = await repository.monorepo();
  await execute(["install", monorepo.package, "--asset", ".mcp.json"]);
  expect(fs.existsSync(path.join(monorepo.package, ".mcp.json"))).toBe(true);
  expect(fs.existsSync(path.join(monorepo.root, ".mcp.json"))).toBe(false);
  const conflictTarget = repository.conflict();
  expect((await execute(["install", conflictTarget, "--asset", ".mcp.json"], { reject: false })).exitCode).toBe(1);
  await execute(["install", conflictTarget, "--asset", ".mcp.json", "--force"]);

  const missing = JSON.parse((await execute(["diagnostics", path.join(workspace, "missing target")])).stdout);
  expect(missing).toMatchObject({ target: { exists: false, directory: false }, manifest: { present: false } });
  const reportDirectory = repository.plain("report");
  const beforeReport = fs.readdirSync(reportDirectory);
  const report = new URL((await execute([
    "report-issue", "--diagnostics-consent",
    "--message", "token=ghp_ABCdef123 C:\\Users\\example\\project /Users/example/project",
    "--action", "install", "--code", "AGENT_DISTRO_E_UNEXPECTED",
  ], { cwd: reportDirectory })).stdout);
  const body = report.searchParams.get("body") ?? "";
  expect(body).toContain("[redacted]");
  expect(body).toContain("[local-path]");
  expect(fs.readdirSync(reportDirectory)).toEqual(beforeReport);
}, 60_000);
