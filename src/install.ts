import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assetChoices, catalog, profileChoices, selectedCatalogAssets } from "./catalog.js";
import { fail } from "./errors.js";
import { hasSymlinkAncestor, manifestParts } from "./managed-path.js";

/** The installer owns only these intentionally bare Copilot-compatible assets. */
const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
const recoveryFile = ".agent-distro-recovery.json";

export { assetChoices, profileChoices };

/** Receives concise, content-free lifecycle messages for an installation. */
export type InstallProgress = (message: string) => void;

/**
 * Controls one transactional installation.
 *
 * Selection values are validated against the bundled catalog before any file is
 * written. `onStep` observes phase boundaries only and never receives content
 * or absolute managed-file paths.
 */
export type InstallOptions = {
  force?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
  selected?: string[];
  profiles?: string[];
  onStep?: InstallProgress;
};

export type ManagedSelection = { stacks: string[]; profiles: string[]; assets: string[] };

/** Reads current or legacy ownership metadata without trusting its paths. */
export function readManagedSelection(target: string): ManagedSelection | undefined {
  const manifestPath = path.join(target, ".agent-distro", "manifest.json");
  if (!fs.existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.tool !== "agent-distro" || ![1, 2].includes(manifest.version) || !Array.isArray(manifest.files))
    throw new Error("invalid manifest");
  const assets = manifest.files.map((file: unknown) => manifestParts(file).join("/"));
  if (manifest.version === 2) {
    const selection = manifest.selection;
    if (
      !selection ||
      ![selection.stacks, selection.profiles, selection.assets].every(
        (values) => Array.isArray(values) && values.every((value) => typeof value === "string"),
      )
    )
      throw new Error("invalid manifest");
    return selection;
  }
  const stacks = [
    ...new Set(assets.map((file) => catalog.assets.find((asset) => asset.path === file)?.stack).filter(Boolean)),
  ];
  return { stacks, profiles: [], assets };
}

/** Stores transaction state under the target so recovery never needs global state. */
function recoveryPath(destination: string) {
  return path.join(destination, ".agent-distro", recoveryFile);
}

/**
 * Restores backups left by an interrupted installation transaction.
 *
 * Recovery validates the journal and each managed path before it removes or
 * restores anything, preventing a corrupted journal from escaping the target.
 */
export function recover(target: string) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory())
    return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  const destination = fs.realpathSync(target);
  const journalPath = recoveryPath(destination);
  if (!fs.existsSync(journalPath)) {
    console.log("No Agent Distro recovery is needed.");
    return 0;
  }
  try {
    if (hasSymlinkAncestor(destination, path.join(".agent-distro", recoveryFile)))
      throw new Error("unsafe recovery journal");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    if (
      journal.version !== 1 ||
      typeof journal.staging !== "string" ||
      !journal.staging.startsWith(".agent-distro-stage-") ||
      journal.staging.includes(path.sep) ||
      !Array.isArray(journal.files)
    )
      throw new Error("invalid recovery journal");
    const staging = path.join(destination, ".agent-distro", journal.staging);
    for (const file of [...journal.files].reverse()) {
      const parts = manifestParts(file?.relative);
      const output = path.join(destination, ...parts);
      const backup = path.join(staging, ".backup", ...parts);
      if (file?.hadPrevious) {
        if (!fs.existsSync(backup)) throw new Error("recovery backup missing");
        fs.rmSync(output, { force: true });
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.renameSync(backup, output);
      } else fs.rmSync(output, { force: true });
    }
    fs.rmSync(journalPath, { force: true });
    fs.rmSync(staging, { recursive: true, force: true });
    console.log("Recovered the previous Agent Distro installation.");
    return 0;
  } catch (error) {
    return fail("AGENT_DISTRO_E_MANIFEST_INVALID", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Synchronizes selected bundled assets into one exact target directory.
 *
 * The operation plans all conflicts before writing, stages replacements, and
 * records a local journal before renames. An unchanged selection is a true
 * no-op: it creates neither a staging directory nor a recovery journal.
 */
export function install(
  target: string,
  { force = false, dryRun = false, quiet = false, selected = [], profiles = [], onStep }: InstallOptions,
) {
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory())
    return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  const destination = fs.existsSync(target) ? fs.realpathSync(target) : path.resolve(target);
  if (fs.existsSync(recoveryPath(destination)))
    return fail("AGENT_DISTRO_E_RECOVERY_REQUIRED", "An incomplete Agent Distro transaction needs recovery.");
  const sourceFiles = selectedCatalogAssets(selected, profiles).map((asset) => asset.split("/").join(path.sep));
  const manifestPath = path.join(destination, ".agent-distro", "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const previous = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const removed = Array.isArray(previous.files)
        ? previous.files.filter(
            (file: unknown) => typeof file === "string" && !sourceFiles.includes(file.split("/").join(path.sep)),
          )
        : [];
      if (removed.length)
        return fail(
          "AGENT_DISTRO_E_ARCHIVE_REQUIRED",
          "This update would remove managed assets; archival support is required first.",
        );
    } catch {
      return fail("AGENT_DISTRO_E_MANIFEST_INVALID", "invalid manifest");
    }
  }
  const selection = {
    stacks: [
      ...new Set(
        sourceFiles.map((file) => catalog.assets.find((asset) => asset.path === file.split(path.sep).join("/"))?.stack),
      ),
    ],
    profiles: [...new Set(profiles)],
    assets: [...new Set(selected)],
  };
  const outputFiles = [...sourceFiles, ".agent-distro/manifest.json"];
  const manifest = JSON.stringify(
    {
      tool: "agent-distro",
      version: 2,
      catalogVersion: catalog.version,
      selection,
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
  const contents = new Map(sourceFiles.map((relative) => [relative, fs.readFileSync(path.join(assets, relative))]));
  contents.set(".agent-distro/manifest.json", Buffer.from(manifest));
  // Never traverse a symlinked ancestor: even a valid relative path could then
  // write outside the explicitly chosen target.
  const unsafe = outputFiles.filter((relative) => hasSymlinkAncestor(destination, relative));
  if (unsafe.length)
    return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", `Refusing symlinked managed paths: ${unsafe.join(", ")}`);
  const directories = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    return fs.existsSync(output) && !fs.lstatSync(output).isFile();
  });
  if (directories.length)
    return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", `Refusing non-file managed paths: ${directories.join(", ")}`);
  // Compare every managed output before staging so a conflict cannot leave a
  // partially updated target. --force is the explicit opt-in to replacement.
  const conflicts = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    return fs.existsSync(output) && !contents.get(relative).equals(fs.readFileSync(output));
  });
  if (conflicts.length && !force)
    return fail("AGENT_DISTRO_E_CONFLICT", `Refusing to overwrite: ${conflicts.join(", ")}`);
  const changed = outputFiles.filter(
    (relative) => !fs.existsSync(path.join(destination, relative)) || conflicts.includes(relative),
  );
  onStep?.(
    changed.length === 0
      ? "Validated destination; selected assets are already up to date."
      : `Validated destination; ${changed.length} file${changed.length === 1 ? "" : "s"} need updating.`,
  );
  if (!quiet) console.log(`${dryRun ? "Would sync" : "Synced"} ${changed.length} changed assets to ${destination}`);
  if (dryRun || changed.length === 0) return 0;
  let staging = "";
  const replacements: { relative: string; output: string; backup?: string }[] = [];
  const committed: typeof replacements = [];
  try {
    // Stage first, then journal backups before the first visible rename. This
    // makes both in-process rollback and a later `recover` operation possible.
    onStep?.("Staging changes safely.");
    fs.mkdirSync(path.join(destination, ".agent-distro"), { recursive: true });
    staging = fs.mkdtempSync(path.join(destination, ".agent-distro", ".agent-distro-stage-"));
    for (const relative of changed) {
      const staged = path.join(staging, relative);
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.writeFileSync(staged, contents.get(relative));
    }
    for (const relative of changed) {
      const output = path.join(destination, relative);
      const backup = path.join(staging, ".backup", relative);
      if (fs.existsSync(output)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(output, backup);
      }
      replacements.push({ relative, output, backup: fs.existsSync(output) ? backup : undefined });
    }
    fs.writeFileSync(
      recoveryPath(destination),
      JSON.stringify({
        version: 1,
        staging: path.basename(staging),
        files: replacements.map(({ relative, backup }) => ({ relative, hadPrevious: Boolean(backup) })),
      }),
    );
    onStep?.("Applying staged changes.");
    for (const replacement of replacements) {
      fs.mkdirSync(path.dirname(replacement.output), { recursive: true });
      fs.renameSync(path.join(staging, replacement.relative), replacement.output);
      committed.push(replacement);
    }
  } catch (error) {
    // Only committed renames need rollback; uncommitted staged files are safe
    // to discard with the transaction directory.
    onStep?.("Rolling back partial changes.");
    for (const { output, backup } of committed.reverse()) {
      if (backup && fs.existsSync(backup)) {
        fs.rmSync(output, { force: true });
        fs.renameSync(backup, output);
      } else fs.rmSync(output, { force: true });
    }
    fs.rmSync(recoveryPath(destination), { force: true });
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    onStep?.("Rollback complete.");
    return fail("AGENT_DISTRO_E_UNEXPECTED", error instanceof Error ? error.message : String(error));
  }
  fs.rmSync(recoveryPath(destination), { force: true });
  fs.rmSync(staging, { recursive: true, force: true });
  onStep?.("Finalized installation.");
  return 0;
}
