import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

it("installs the packed npm binary without source assets", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "asdlc-package-"));
  const cache = path.join(workspace, "cache");
  const env = { ...process.env, NPM_CONFIG_CACHE: cache, npm_config_cache: cache };
  try {
    await execa(npm, ["pack", "--pack-destination", workspace], { cwd: root, env });
    const archive = fs.readdirSync(workspace).find((file) => file.endsWith(".tgz"));
    const consumer = path.join(workspace, "consumer");
    await execa(npm, ["install", "--prefix", consumer, "--ignore-scripts", "--no-audit", "--no-fund", path.join(workspace, archive)], { env });
    const binary = path.join(consumer, "node_modules", ".bin", process.platform === "win32" ? "asdlc.cmd" : "asdlc");
    expect(fs.existsSync(binary)).toBe(true);
    const execute = (args, options) => execa(npm, ["exec", "--prefix", consumer, "--", "asdlc", ...args], options);
    expect((await execute(["--version"])).stdout).toBe("0.0.0");
    await execute(["install", path.join(workspace, "target"), "--all"]);
    expect(fs.existsSync(path.join(workspace, "target", ".asdlc", "manifest.json"))).toBe(true);
    const reportDirectory = path.join(workspace, "report");
    fs.mkdirSync(reportDirectory);
    const beforeReport = fs.readdirSync(reportDirectory);
    const report = new URL((await execute([
      "report-issue",
      "--diagnostics-consent",
      "--message",
      "token=ghp_ABCdef123 C:\\Users\\example\\project /Users/example/project",
      "--action",
      "install",
      "--code",
      "ASDLC_E_UNEXPECTED",
    ], { cwd: reportDirectory })).stdout);
    const body = report.searchParams.get("body") ?? "";
    expect(report.origin + report.pathname).toBe("https://github.com/mortenbroesby/agent-distro/issues/new");
    expect(body).toContain("Action: install");
    expect(body).toContain("Code: ASDLC_E_UNEXPECTED");
    expect(body).toContain("[redacted]");
    expect(body).toContain("[local-path]");
    expect(body).not.toContain("ghp_ABCdef123");
    expect(fs.readdirSync(reportDirectory)).toEqual(beforeReport);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}, 30_000);
