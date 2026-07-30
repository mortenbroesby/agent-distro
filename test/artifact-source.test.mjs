/**
 * Proves artifact packages are treated as inert content: their metadata is
 * inspected, their files are extracted only into caller-controlled staging,
 * and source forms that can trigger package scripts are rejected first.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
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
 * @param {object} [artifactManifest] - Optional manifest for containment-rejection tests.
 */
function writeArtifactPackage(
  directory,
  packageOptions = {},
  artifactManifest = { schemaVersion: 1, assets: [{ path: "skills/example/SKILL.md", type: "skill" }] },
) {
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "fixture-agent-distro-artifact", version: "1.0.0", ...packageOptions }),
  );
  fs.writeFileSync(path.join(directory, "agent-distro.manifest.json"), JSON.stringify(artifactManifest));
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

/**
 * Serves one packed artifact through the two registry endpoints Pacote uses:
 * package metadata and its resolved tarball. This proves package and tag
 * resolution without relying on the public npm registry in tests.
 *
 * @param {string} tarball - Absolute path to the packed artifact tarball.
 * @returns {Promise<{registry: string, integrity: string, close: () => Promise<void>}>} Local registry controls.
 */
async function createRegistry(tarball) {
  const contents = fs.readFileSync(tarball);
  const integrity = `sha512-${crypto.createHash("sha512").update(contents).digest("base64")}`;
  let registry = "";
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", registry).pathname;
    if (pathname === "/fixture-agent-distro-artifact") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          name: "fixture-agent-distro-artifact",
          "dist-tags": { latest: "1.0.0" },
          versions: {
            "1.0.0": {
              name: "fixture-agent-distro-artifact",
              version: "1.0.0",
              dist: { tarball: `${registry}/fixture-agent-distro-artifact-1.0.0.tgz`, integrity },
            },
          },
        }),
      );
      return;
    }
    if (pathname === "/fixture-agent-distro-artifact-1.0.0.tgz") {
      response.setHeader("content-type", "application/octet-stream");
      response.end(contents);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test registry did not listen on TCP");
  registry = `http://127.0.0.1:${address.port}`;
  return {
    registry,
    integrity,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
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

test("rejects an asset outside its declared content root", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-artifact-"));
  try {
    writeArtifactPackage(workspace, {}, { schemaVersion: 1, assets: [{ path: "agents/example.md", type: "skill" }] });
    await expect(
      extractArtifact(`file:${await packArtifact(workspace)}`, path.join(workspace, "staging")),
    ).rejects.toThrow("invalid asset declaration");
    expect(fs.existsSync(path.join(workspace, "staging"))).toBe(false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("resolves a registry package tag with verified integrity", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-artifact-"));
  try {
    writeArtifactPackage(workspace);
    const source = await createRegistry(await packArtifact(workspace));
    try {
      const extracted = await extractArtifact("fixture-agent-distro-artifact@latest", path.join(workspace, "staging"), {
        registry: source.registry,
      });
      expect(extracted.package).toMatchObject({
        name: "fixture-agent-distro-artifact",
        version: "1.0.0",
        integrity: source.integrity,
        resolved: `${source.registry}/fixture-agent-distro-artifact-1.0.0.tgz`,
      });
    } finally {
      await source.close();
    }
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
