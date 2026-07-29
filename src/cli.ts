#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

function files(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory()
      ? files(path.join(dir, entry.name), relative)
      : [relative];
  });
}

function usage() {
  console.log("Usage: asdlc <install|verify> <target> [--dry-run] [--force]");
}

function hasSymlinkAncestor(root: string, relative: string) {
  let current = root;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

function manifestParts(relative: unknown) {
  if (typeof relative !== "string" || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) {
    throw new Error(`unsafe manifest path: ${relative}`);
  }
  const parts = relative.split(/[\\\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`unsafe manifest path: ${relative}`);
  }
  return parts;
}

function verify(target: string) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error(`Target is not a directory: ${target}`);
    return 1;
  }
  const destination = fs.realpathSync(target);
  const manifestPath = path.join(destination, ".asdlc", "manifest.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.tool !== "asdlc" || manifest.version !== 1 || !Array.isArray(manifest.files)) {
      throw new Error("invalid manifest");
    }
    for (const relative of manifest.files) {
      const parts = manifestParts(relative);
      if (hasSymlinkAncestor(destination, parts.join(path.sep))) throw new Error(`symlinked asset path: ${relative}`);
      const output = path.join(destination, ...parts);
      if (!fs.existsSync(output) || !fs.statSync(output).isFile()) {
        throw new Error(`missing asset: ${relative}`);
      }
      const hash = crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex");
      if (manifest.hashes?.[relative] !== hash) throw new Error(`changed asset: ${relative}`);
    }
    console.log(`Verified ${manifest.files.length} assets in ${destination}`);
    return 0;
  } catch (error) {
    console.error(`ASDLC verification failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

export function run(args: string[]) {
  const [command, target, ...options] = args;
  if (command === "--help" && !target) {
    usage();
    return 0;
  }
  if (command === "--version" && !target) {
    console.log(`asdlc ${version}`);
    return 0;
  }
  if (command === "verify" && target && options.length === 0) return verify(target);
  if (
    command !== "install" ||
    !target ||
    options.some((option) => option !== "--force" && option !== "--dry-run")
  ) {
    usage();
    return 1;
  }

  const force = options.includes("--force");
  const dryRun = options.includes("--dry-run");
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    console.error(`Target is not a directory: ${target}`);
    return 1;
  }
  const destination = fs.existsSync(target)
    ? fs.realpathSync(target)
    : path.resolve(target);
  const sourceFiles = files(assets);
  const manifestPath = path.join(destination, ".asdlc", "manifest.json");
  const outputFiles = [...sourceFiles, ".asdlc/manifest.json"];
  const manifest = JSON.stringify(
    {
      tool: "asdlc",
      version: 1,
      files: sourceFiles.map((relative) => relative.split(path.sep).join("/")),
      hashes: Object.fromEntries(
        sourceFiles.map((relative) => [
          relative.split(path.sep).join("/"),
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(assets, relative)))
            .digest("hex"),
        ]),
      ),
    },
    null,
    2,
  ).concat("\n");
  const contents = new Map(
    sourceFiles.map((relative) => [relative, fs.readFileSync(path.join(assets, relative))]),
  );
  contents.set(".asdlc/manifest.json", Buffer.from(manifest));
  const unsafe = outputFiles.filter((relative) => hasSymlinkAncestor(destination, relative));
  if (unsafe.length) {
    console.error(`Refusing symlinked target path: ${unsafe.join(", ")}`);
    return 1;
  }
  const directories = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    return fs.existsSync(output) && !fs.lstatSync(output).isFile();
  });
  if (directories.length) {
    console.error(`Refusing non-file target path: ${directories.join(", ")}`);
    return 1;
  }
  const conflicts = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    if (!fs.existsSync(output)) return false;
    return !contents.get(relative).equals(fs.readFileSync(output));
  });

  if (conflicts.length && !force) {
    console.error(`Refusing to overwrite: ${conflicts.join(", ")}`);
    console.error("Run again with --force to replace them.");
    return 1;
  }

  const changed = outputFiles.filter((relative) => !fs.existsSync(path.join(destination, relative)) || conflicts.includes(relative));
  console.log(`${dryRun ? "Would sync" : "Synced"} ${changed.length} changed assets to ${destination}`);
  if (dryRun) return 0;
  for (const relative of changed) {
    const output = path.join(destination, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.asdlc-${process.pid}`;
    fs.writeFileSync(temporary, contents.get(relative));
    fs.renameSync(temporary, output);
  }
  return 0;
}
