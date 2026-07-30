// End-to-end consumer proof: npm packs this project, installs it into a fresh
// consumer, and runs its public binary against real filesystem repository shapes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execa } from "execa";
import { expect } from "vitest";
import { test } from "./support/repository-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const bootstrap = path.join(root, "scripts", "bootstrap.mjs");

const bootstrapAsNode = (version) =>
  execa(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(version)} }); process.argv = [process.execPath, ${JSON.stringify(bootstrap)}]; await import(${JSON.stringify(pathToFileURL(bootstrap).href)});`,
    ],
    {
      env: { ...process.env, PATH: "", npm_execpath: path.join(root, "missing-npm-cli.js") },
      reject: false,
    },
  );

test("bootstraps the packed global binary without installing assets", async ({ repository }) => {
  const prefix = repository.plain("global prefix");
  const target = repository.plain("bootstrap cwd");
  const home = repository.plain("managed home");
  const bootstrapped = await execa(process.execPath, [bootstrap], {
    cwd: target,
    env: { ...process.env, AGENT_DISTRO_HOME: home, NPM_CONFIG_PREFIX: prefix },
  });
  const executable = path.join(prefix, process.platform === "win32" ? "agent-distro.cmd" : "bin/agent-distro");
  expect(bootstrapped.stdout).toContain("Usage: agent-distro");
  expect(fs.readdirSync(target)).toEqual([]);
  expect(fs.existsSync(path.join(home, "repo", ".git"))).toBe(true);
  expect(fs.existsSync(executable)).toBe(true);
  expect((await execa(executable, ["--version"])).stdout).toBe("0.0.0");

  const doctorTarget = repository.plain("doctor target-å");
  await execa(executable, ["install", doctorTarget, "--asset", ".mcp.json"]);
  const manifest = fs.readFileSync(path.join(doctorTarget, ".agent-distro", "manifest.json"));
  const diagnosed = await execa(process.execPath, [bootstrap, "--doctor", doctorTarget], {
    cwd: target,
    env: { ...process.env, AGENT_DISTRO_HOME: home, NPM_CONFIG_PREFIX: prefix },
  });
  expect(diagnosed.stdout).toContain("Verified 1 assets");
  expect(fs.readFileSync(path.join(doctorTarget, ".agent-distro", "manifest.json"))).toEqual(manifest);
  expect(fs.readdirSync(target)).toEqual([]);
  await execa(executable, ["upgrade"], { env: { ...process.env, AGENT_DISTRO_HOME: home, NPM_CONFIG_PREFIX: prefix } });
}, 60_000);

test("cleans its temporary package after a failed global install", async ({ repository }) => {
  const temporary = repository.plain("bootstrap temp");
  const invalidPrefix = path.join(repository.root, "prefix file");
  fs.writeFileSync(invalidPrefix, "not a directory\n");
  const result = await execa(process.execPath, [bootstrap], {
    env: {
      ...process.env,
      NPM_CONFIG_PREFIX: invalidPrefix,
      TEMP: temporary,
      TMP: temporary,
      TMPDIR: temporary,
    },
    reject: false,
  });
  expect(result.exitCode).toBe(1);
  expect(fs.readdirSync(temporary).filter((name) => name.startsWith("agent-distro-bootstrap-"))).toEqual([]);
}, 60_000);

test("declares and builds for the lowest supported Node runtime", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  expect(packageJson.engines.node).toBe(">=20.12.0 <27");
  expect(packageJson.scripts.build).toContain("--target node20.12");
  expect(fs.existsSync(path.join(root, "README.md"))).toBe(false);
});

test("distinguishes checkout build Nodes from packed runtime support", async () => {
  const buildError =
    "Building Agent Distro from this checkout requires Node ^22.18.0 or >=24.11.0 <27 (tsdown build requirement). The packed CLI supports Node >=20.12.0 <27.";
  for (const version of ["20.12.0", "22.17.9", "23.11.0", "24.10.9", "27.0.0"]) {
    expect((await bootstrapAsNode(version)).stderr).toContain(buildError);
  }
  for (const version of ["22.18.0", "24.11.0", "26.0.0"]) {
    expect((await bootstrapAsNode(version)).stderr).not.toContain(buildError);
  }
});

test("installs the packed npm binary into real repository shapes", async ({ repository }) => {
  const workspace = repository.root;
  const cache = path.join(workspace, "cache");
  const env = { ...process.env, NPM_CONFIG_CACHE: cache, npm_config_cache: cache };
  await execa(npm, ["pack", "--pack-destination", workspace], { cwd: root, env });
  const archive = fs.readdirSync(workspace).find((file) => file.endsWith(".tgz"));
  const consumer = path.join(workspace, "consumer");
  await execa(
    npm,
    ["install", "--prefix", consumer, "--ignore-scripts", "--no-audit", "--no-fund", path.join(workspace, archive)],
    { env },
  );
  const execute = (args, options) => execa(npm, ["exec", "--prefix", consumer, "--", "agent-distro", ...args], options);
  expect((await execute(["--version"])).stdout).toBe("0.0.0");

  // Spaces and Unicode make launcher and path handling failures visible on both
  // supported platforms without relying on a synthetic filesystem.
  const plain = repository.plain("target with spaces-å");
  await execute(["install", plain, "--all"]);
  expect((await execute(["doctor", plain])).stdout).toMatch(/Verified [1-9]\d* assets/);

  // An existing matching installation is a true no-op: no force, staging, or
  // ownership rewrite is needed when the selected profile has not changed.
  const priorInstall = repository.plain("prior installation");
  await execute(["install", priorInstall, "--profile", "debugging"]);
  const manifest = fs.readFileSync(path.join(priorInstall, ".agent-distro", "manifest.json"));
  expect((await execute(["install", priorInstall, "--profile", "debugging"])).stdout).toContain(
    "Synced 0 changed assets",
  );
  expect(fs.readFileSync(path.join(priorInstall, ".agent-distro", "manifest.json"))).toEqual(manifest);
  expect(
    fs.readdirSync(path.join(priorInstall, ".agent-distro")).some((name) => name.startsWith(".agent-distro-stage-")),
  ).toBe(false);
  const debugging = repository.plain("debugging profile");
  await execute(["install", debugging, "--profile", "debugging"]);
  expect((await execute(["doctor", debugging])).stdout).toMatch(/Verified [1-9]\d* assets/);

  // Git state is deliberately incidental: the installer targets only the exact
  // directory supplied, including a nested package within a monorepo.
  const git = await repository.git();
  await execute(["install", git, "--asset", ".mcp.json"]);
  expect((await execute(["doctor", git])).stdout).toMatch(/Verified [1-9]\d* assets/);
  const monorepo = await repository.monorepo();
  await execute(["install", monorepo.package, "--asset", ".mcp.json"]);
  expect(fs.existsSync(path.join(monorepo.package, ".mcp.json"))).toBe(true);
  expect(fs.existsSync(path.join(monorepo.root, ".mcp.json"))).toBe(false);
  const conflictTarget = repository.conflict();
  expect((await execute(["install", conflictTarget, "--asset", ".mcp.json"], { reject: false })).exitCode).toBe(1);
  await execute(["install", conflictTarget, "--asset", ".mcp.json", "--force"]);

  const missing = JSON.parse(
    (await execute(["doctor", "--diagnostics", path.join(workspace, "missing target")])).stdout,
  );
  expect(missing).toMatchObject({ target: { exists: false, directory: false }, manifest: { present: false } });
  const reportDirectory = repository.plain("report");
  const beforeReport = fs.readdirSync(reportDirectory);
  const report = new URL(
    (
      await execute(
        [
          "report-issue",
          "--diagnostics-consent",
          "--message",
          "token=ghp_ABCdef123 C:\\Users\\example\\project /Users/example/project",
          "--action",
          "install",
          "--code",
          "AGENT_DISTRO_E_UNEXPECTED",
        ],
        { cwd: reportDirectory },
      )
    ).stdout,
  );
  const body = report.searchParams.get("body") ?? "";
  expect(body).toContain("[redacted]");
  expect(body).toContain("[local-path]");
  expect(fs.readdirSync(reportDirectory)).toEqual(beforeReport);
}, 60_000);
