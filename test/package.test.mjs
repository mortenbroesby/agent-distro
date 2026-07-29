import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

it("installs the packed npm binary without source assets", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "asdlc-package-"));
  const env = { ...process.env, NPM_CONFIG_CACHE: path.join(workspace, "cache") };
  try {
    execFileSync(npm, ["pack", "--pack-destination", workspace], { cwd: root, env, stdio: "pipe" });
    const archive = fs.readdirSync(workspace).find((file) => file.endsWith(".tgz"));
    execFileSync(npm, ["install", "--prefix", path.join(workspace, "consumer"), "--ignore-scripts", "--no-audit", "--no-fund", path.join(workspace, archive)], { env, stdio: "pipe" });
    execFileSync(path.join(workspace, "consumer", "node_modules", ".bin", process.platform === "win32" ? "asdlc.cmd" : "asdlc"), ["install", path.join(workspace, "target")], { stdio: "pipe" });
    expect(fs.existsSync(path.join(workspace, "target", ".asdlc", "manifest.json"))).toBe(true);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}, 30_000);
