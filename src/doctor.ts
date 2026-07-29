import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fail } from "./errors.js";

const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

function manifestParts(relative: unknown) {
  if (typeof relative !== "string" || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) {
    throw new Error(`unsafe manifest path: ${relative}`);
  }
  const parts = relative.split(/[\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw new Error(`unsafe manifest path: ${relative}`);
  return parts;
}

function hasSymlinkAncestor(root: string, relative: string) {
  let current = root;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

export function verify(target: string) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  const destination = fs.realpathSync(target);
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(destination, ".agent-distro", "manifest.json"), "utf8"));
    if (manifest.tool !== "agent-distro" || manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error("invalid manifest");
    for (const relative of manifest.files) {
      const parts = manifestParts(relative);
      if (hasSymlinkAncestor(destination, parts.join(path.sep))) throw new Error(`symlinked asset path: ${relative}`);
      const output = path.join(destination, ...parts);
      if (!fs.existsSync(output) || !fs.statSync(output).isFile()) throw new Error(`missing asset: ${relative}`);
      const hash = crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex");
      if (manifest.hashes?.[relative] !== hash) throw new Error(`changed asset: ${relative}`);
    }
    console.log(`Verified ${manifest.files.length} assets in ${destination}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message.startsWith("missing asset:") || message.startsWith("changed asset:") ? "AGENT_DISTRO_E_ASSET_DRIFT" : "AGENT_DISTRO_E_MANIFEST_INVALID", message);
  }
}

export function diagnostics(target: string) {
  const snapshot = { version, runtime: { node: process.versions.node, platform: process.platform, arch: process.arch }, target: { exists: fs.existsSync(target), directory: false }, manifest: { present: false, valid: false, assetCount: 0 } };
  if (snapshot.target.exists) {
    snapshot.target.directory = fs.statSync(target).isDirectory();
    if (snapshot.target.directory) {
      const manifestPath = path.join(fs.realpathSync(target), ".agent-distro", "manifest.json");
      snapshot.manifest.present = fs.existsSync(manifestPath);
      if (snapshot.manifest.present) try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        snapshot.manifest.valid = manifest.tool === "agent-distro" && manifest.version === 1 && Array.isArray(manifest.files);
        snapshot.manifest.assetCount = Array.isArray(manifest.files) ? manifest.files.length : 0;
      } catch { /* Diagnostics must remain available when the manifest is malformed. */ }
    }
  }
  process.stdout.write(`${JSON.stringify(snapshot)}\n`);
  return 0;
}
