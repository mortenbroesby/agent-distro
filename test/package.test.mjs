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
  const env = { ...process.env, NPM_CONFIG_CACHE: path.join(workspace, "cache") };
  try {
    await execa(npm, ["pack", "--pack-destination", workspace], { cwd: root, env });
    const archive = fs.readdirSync(workspace).find((file) => file.endsWith(".tgz"));
    const consumer = path.join(workspace, "consumer");
    await execa(npm, ["install", "--prefix", consumer, "--ignore-scripts", "--no-audit", "--no-fund", path.join(workspace, archive)], { env });
    const binary = path.join(consumer, "node_modules", ".bin", process.platform === "win32" ? "asdlc.cmd" : "asdlc");
    expect(fs.existsSync(binary)).toBe(true);
    const execute = (args, options) => execa(npm, ["exec", "--prefix", consumer, "--", "asdlc", ...args], options);
    expect((await execute(["--version"])).stdout).toBe("0.0.0");
    await execute(["install", path.join(workspace, "target")]);
    expect(fs.existsSync(path.join(workspace, "target", ".asdlc", "manifest.json"))).toBe(true);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}, 30_000);
