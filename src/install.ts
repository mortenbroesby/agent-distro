import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assetChoices, catalog, profileChoices, selectedCatalogEntries, type CatalogAsset } from "./catalog.js";
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
  providerChoices?: Record<string, string>;
  onStep?: InstallProgress;
};

export type ProviderConflict = { target: string; providers: Pick<CatalogAsset, "path" | "label" | "stack">[] };

export type ManagedSelection = { stacks: string[]; profiles: string[]; assets: string[] };

type ManagedManifest = {
  version: 1 | 2;
  files: string[];
  hashes?: Record<string, string>;
  selection?: ManagedSelection;
};

/** Parses only the manifest fields needed to retain managed content safely. */
function readManagedManifest(target: string): ManagedManifest | undefined {
  const manifestPath = path.join(target, ".agent-distro", "manifest.json");
  if (!fs.existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.tool !== "agent-distro" || ![1, 2].includes(manifest.version) || !Array.isArray(manifest.files))
    throw new Error("invalid manifest");
  const files = manifest.files.map((file: unknown) => manifestParts(file).join("/"));
  const hashes =
    manifest.hashes && typeof manifest.hashes === "object"
      ? Object.fromEntries(
          Object.entries(manifest.hashes).filter(
            ([file, hash]) => typeof hash === "string" && files.includes(manifestParts(file).join("/")),
          ),
        )
      : undefined;
  if (manifest.version === 2) {
    const selection = manifest.selection;
    if (
      !selection ||
      ![selection.stacks, selection.profiles, selection.assets].every(
        (values) => Array.isArray(values) && values.every((value) => typeof value === "string"),
      )
    )
      throw new Error("invalid manifest");
    return { version: 2, files, hashes, selection };
  }
  return { version: 1, files, hashes };
}

/** Reads current or legacy ownership metadata without trusting its paths. */
export function readManagedSelection(target: string): ManagedSelection | undefined {
  const manifest = readManagedManifest(target);
  if (!manifest) return undefined;
  if (manifest.selection)
    return {
      stacks: manifest.selection.stacks.filter((stack) => catalog.stacks.some(({ id }) => id === stack)),
      profiles: manifest.selection.profiles.filter((profile) => catalog.profiles.some(({ id }) => id === profile)),
      assets: manifest.selection.assets.filter((asset) => catalog.assets.some(({ path }) => path === asset)),
    };
  const assets = manifest.files;
  const selected = assets.filter((file) => catalog.assets.some((asset) => asset.path === file));
  const stacks = [
    ...new Set(selected.map((file) => catalog.assets.find((asset) => asset.path === file)?.stack).filter(Boolean)),
  ];
  return { stacks, profiles: [], assets: selected };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeJson(left: unknown, right: unknown): unknown | undefined {
  if (!isObject(left) || !isObject(right)) return JSON.stringify(left) === JSON.stringify(right) ? left : undefined;
  const merged: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (!(key in merged)) merged[key] = value;
    else {
      const next = mergeJson(merged[key], value);
      if (next === undefined) return undefined;
      merged[key] = next;
    }
  }
  return merged;
}

type Contribution = CatalogAsset & { content: Buffer };

/** Finds declared providers that cannot safely compose without a user choice. */
export function providerConflicts(entries: CatalogAsset[]): ProviderConflict[] {
  const groups = new Map<string, CatalogAsset[]>();
  for (const entry of entries) groups.set(entry.target, [...(groups.get(entry.target) ?? []), entry]);
  return [...groups]
    .filter(([, providers]) => {
      if (providers.length < 2 || providers.some((provider) => provider.merge !== "json")) return providers.length > 1;
      try {
        return (
          providers
            .map((provider) => JSON.parse(fs.readFileSync(path.join(assets, ...manifestParts(provider.path)), "utf8")))
            .reduce((result, value) => (result === undefined ? undefined : mergeJson(result, value))) === undefined
        );
      } catch {
        return true;
      }
    })
    .map(([target, providers]) => ({
      target,
      providers: providers.map(({ path, label, stack }) => ({ path, label, stack })),
    }));
}

function resolveContributions(entries: CatalogAsset[], choices: Record<string, string>, force: boolean) {
  const groups = new Map<string, Contribution[]>();
  for (const entry of entries) {
    const contribution = { ...entry, content: fs.readFileSync(path.join(assets, ...manifestParts(entry.path))) };
    groups.set(entry.target, [...(groups.get(entry.target) ?? []), contribution]);
  }
  const contents = new Map<string, Buffer>();
  const conflicts: ProviderConflict[] = [];
  for (const [target, providers] of groups) {
    if (providers.length === 1) contents.set(target, providers[0].content);
    else if (providers.every((provider) => provider.merge === "json")) {
      try {
        const merged = providers
          .map((provider) => JSON.parse(provider.content.toString("utf8")))
          .reduce((result, value) => (result === undefined ? undefined : mergeJson(result, value)));
        if (merged === undefined) throw new Error("incompatible JSON values");
        contents.set(target, Buffer.from(JSON.stringify(merged, null, 2) + "\n"));
      } catch {
        conflicts.push({ target, providers: providers.map(({ path, label, stack }) => ({ path, label, stack })) });
      }
    } else conflicts.push({ target, providers: providers.map(({ path, label, stack }) => ({ path, label, stack })) });
    const chosen = choices[target];
    if (chosen) {
      const provider = providers.find(({ path }) => path === chosen);
      if (!provider) throw new Error(`invalid provider choice for ${target}`);
      contents.set(target, provider.content);
      const index = conflicts.findIndex((conflict) => conflict.target === target);
      if (index >= 0) conflicts.splice(index, 1);
    }
  }
  if (conflicts.length && force) {
    for (const conflict of conflicts) {
      const provider = groups.get(conflict.target)?.at(-1);
      if (provider) contents.set(conflict.target, provider.content);
    }
    return contents;
  }
  if (conflicts.length)
    throw new Error(`provider choice required: ${conflicts.map(({ target }) => target).join(", ")}`);
  return contents;
}

function archiveRecord(files: string[]) {
  return `# Agent Distro archive\n\nArchived ${new Date().toISOString()} during an install or update.\n\n${files
    .map((file) => `- \`${file}\``)
    .join("\n")}\n`;
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
  {
    force = false,
    dryRun = false,
    quiet = false,
    selected = [],
    profiles = [],
    providerChoices = {},
    onStep,
  }: InstallOptions,
) {
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory())
    return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  const destination = fs.existsSync(target) ? fs.realpathSync(target) : path.resolve(target);
  if (fs.existsSync(recoveryPath(destination)))
    return fail("AGENT_DISTRO_E_RECOVERY_REQUIRED", "An incomplete Agent Distro transaction needs recovery.");
  const selectedEntries = selectedCatalogEntries(selected, profiles);
  let resolvedContents: Map<string, Buffer>;
  try {
    resolvedContents = resolveContributions(selectedEntries, providerChoices, force);
  } catch (error) {
    return fail("AGENT_DISTRO_E_CONFLICT", error instanceof Error ? error.message : String(error));
  }
  const contents = new Map(
    [...resolvedContents].map(([target, content]) => [target.split("/").join(path.sep), content]),
  );
  const sourceFiles = [...contents.keys()].map((asset) => asset.split("/").join(path.sep));
  let previous: ManagedManifest | undefined;
  try {
    previous = readManagedManifest(destination);
  } catch {
    return fail("AGENT_DISTRO_E_MANIFEST_INVALID", "invalid manifest");
  }
  const previousFiles = (previous?.files ?? []).map((file) => file.split("/").join(path.sep));
  const removed = previousFiles.filter((file) => !sourceFiles.includes(file));
  const selection = {
    stacks: [...new Set(selectedEntries.map((asset) => asset.stack))],
    profiles: [...new Set(profiles)],
    assets: [...new Set(selected)],
  };
  const outputFiles = [...sourceFiles, ".agent-distro/manifest.json"];
  const removedExisting = removed.filter((relative) => fs.existsSync(path.join(destination, relative)));
  const managedFiles = [...new Set([...outputFiles, ...removedExisting])];
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
          crypto.createHash("sha256").update(contents.get(relative)!).digest("hex"),
        ]),
      ),
    },
    null,
    2,
  ).concat("\n");
  contents.set(".agent-distro/manifest.json", Buffer.from(manifest));
  // Never traverse a symlinked ancestor: even a valid relative path could then
  // write outside the explicitly chosen target.
  const unsafe = managedFiles.filter((relative) => hasSymlinkAncestor(destination, relative));
  if (unsafe.length)
    return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", `Refusing symlinked managed paths: ${unsafe.join(", ")}`);
  const directories = managedFiles.filter((relative) => {
    const output = path.join(destination, relative);
    return fs.existsSync(output) && !fs.lstatSync(output).isFile();
  });
  if (directories.length)
    return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", `Refusing non-file managed paths: ${directories.join(", ")}`);
  // Compare every managed output before staging so a conflict cannot leave a
  // partially updated target. --force is the explicit opt-in to replacement.
  const conflicts = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    const previousHash = previous?.hashes?.[relative.split(path.sep).join("/")];
    return (
      fs.existsSync(output) &&
      !contents.get(relative).equals(fs.readFileSync(output)) &&
      !(relative === ".agent-distro/manifest.json" && previous) &&
      (!previousHash || crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex") !== previousHash)
    );
  });
  if (conflicts.length && !force)
    return fail("AGENT_DISTRO_E_CONFLICT", `Refusing to overwrite: ${conflicts.join(", ")}`);
  const archived = [
    ...new Set([...removedExisting, ...conflicts.filter((relative) => sourceFiles.includes(relative))]),
  ];
  const archiveId = archived.length ? `${Date.now()}-${crypto.randomBytes(4).toString("hex")}` : undefined;
  if (archiveId) {
    const archiveRoot = path.join(destination, ".agent-distro", ".archive");
    if (hasSymlinkAncestor(destination, path.join(".agent-distro", ".archive", archiveId, "README.md")))
      return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", "Refusing symlinked Agent Distro archive path.");
    if (fs.existsSync(archiveRoot) && !fs.lstatSync(archiveRoot).isDirectory())
      return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", "Refusing non-directory Agent Distro archive path.");
  }
  const changed = outputFiles.filter(
    (relative) =>
      !fs.existsSync(path.join(destination, relative)) ||
      !contents.get(relative).equals(fs.readFileSync(path.join(destination, relative))),
  );
  onStep?.(
    changed.length === 0
      ? "Validated destination; selected assets are already up to date."
      : `Validated destination; ${changed.length} file${changed.length === 1 ? "" : "s"} need updating.`,
  );
  if (!quiet) console.log(`${dryRun ? "Would sync" : "Synced"} ${changed.length} changed assets to ${destination}`);
  if (dryRun || changed.length === 0) return 0;
  let staging = "";
  const replacements: { relative: string; output: string; backup?: string; remove?: true }[] = [];
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
    for (const relative of removedExisting) {
      const output = path.join(destination, relative);
      const backup = path.join(staging, ".backup", relative);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(output, backup);
      replacements.push({ relative, output, backup, remove: true });
    }
    if (archiveId) {
      const archive = path.join(staging, ".archive");
      for (const relative of archived) {
        const archivedFile = path.join(archive, relative);
        fs.mkdirSync(path.dirname(archivedFile), { recursive: true });
        fs.copyFileSync(path.join(staging, ".backup", relative), archivedFile);
      }
      fs.writeFileSync(
        path.join(archive, "README.md"),
        archiveRecord(archived.map((file) => file.split(path.sep).join("/"))),
      );
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
      if (replacement.remove) fs.rmSync(replacement.output);
      else {
        fs.mkdirSync(path.dirname(replacement.output), { recursive: true });
        fs.renameSync(path.join(staging, replacement.relative), replacement.output);
      }
      committed.push(replacement);
    }
    if (archiveId) {
      fs.mkdirSync(path.join(destination, ".agent-distro", ".archive"), { recursive: true });
      fs.renameSync(path.join(staging, ".archive"), path.join(destination, ".agent-distro", ".archive", archiveId));
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
  if (archiveId) {
    const message = `Archived ${archived.length} displaced asset${archived.length === 1 ? "" : "s"} under .agent-distro/.archive/${archiveId}.`;
    if (!quiet) console.log(message);
    onStep?.(message);
  }
  onStep?.("Finalized installation.");
  return 0;
}
