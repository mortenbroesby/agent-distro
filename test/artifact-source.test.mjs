/**
 * Proves artifact packages are treated as inert content: their metadata is
 * inspected, their files are extracted only into caller-controlled staging,
 * and source forms that can trigger package scripts are rejected first.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { expect, test } from "vitest";
import { extractArtifact } from "../src/artifact-source.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * Writes the smallest package that can carry Agent Distro artifacts.
 *
 * @param {string} directory - Empty directory that receives package files.
 * @param {{scripts?: Record<string, string>}} [packageOptions] - Optional package metadata for rejection tests.
 */
function writeArtifactPackage(directory, packageOptions = {}) {
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "fixture-agent-distro-artifact", version: "1.0.0", ...packageOptions }),
  );
  fs.writeFileSync(
    path.join(directory, "agent-distro.manifest.json"),
    JSON.stringify({ schemaVersion: 1, assets: [{ path: "skills/example/SKILL.md", type: "skill" }] }),
  );
  fs.mkdirSync(path.join(directory, "skills", "example"), { recursive: true });
  fs.writeFileSync(path.join(directory, "skills", "example", "SKILL.md"), "# Example\n");
}

/**
 * Packs a fixture without installing it, yielding a local tarball spec that
 * follows the same Pacote extraction path as a downloaded tarball.
 *
 * @param {string} directory - Fixture package directory.
 * @returns {Promise<string>} Absolute tarball path.
 */
async function packArtifact(directory) {
  const packed = await execa(npm, ["pack", "--json", "--silent", "--pack-destination", directory], { cwd: directory });
  const [{ filename }] = JSON.parse(packed.stdout);
  return path.join(directory, filename);
}

test("extracts a tarball artifact into caller-owned staging", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-artifact-"));
  try {
    writeArtifactPackage(workspace);
    const extracted = await extractArtifact(`file:${await packArtifact(workspace)}`, path.join(workspace, "staging"));
    expect(extracted.package).toMatchObject({ name: "fixture-agent-distro-artifact", version: "1.0.0" });
    expect(extracted.manifest).toEqual({
      schemaVersion: 1,
      assets: [{ path: "skills/example/SKILL.md", type: "skill" }],
    });
    expect(fs.readFileSync(path.join(workspace, "staging", "skills", "example", "SKILL.md"), "utf8")).toBe(
      "# Example\n",
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("rejects package lifecycle scripts before extraction", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-artifact-"));
  try {
    writeArtifactPackage(workspace, { scripts: { preinstall: 'node -e "process.exit(1)"' } });
    await expect(
      extractArtifact(`file:${await packArtifact(workspace)}`, path.join(workspace, "staging")),
    ).rejects.toThrow("lifecycle scripts");
    expect(fs.existsSync(path.join(workspace, "staging"))).toBe(false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("rejects local directories before their prepare scripts can run", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-artifact-"));
  const sentinel = path.join(workspace, "prepare-ran");
  try {
    writeArtifactPackage(workspace, {
      scripts: { prepare: `node -e "require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran')"` },
    });
    await expect(extractArtifact(workspace, path.join(workspace, "staging"))).rejects.toThrow(
      "local directories are not supported",
    );
    expect(fs.existsSync(sentinel)).toBe(false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("rejects Git specs before Pacote can run prepare", async () => {
  await expect(extractArtifact("github:npm/cli", path.join(root, "ignored"))).rejects.toThrow(
    "Git sources are not supported",
  );
});
