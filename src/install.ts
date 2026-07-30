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

/**
 * Receives concise, content-free lifecycle messages for an installation.
 *
 * Callers can surface these messages in a CLI, TUI log, or diagnostic stream
 * without exposing an asset's contents or absolute target paths.
 */
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

/**
 * Describes providers that cannot produce one safe target without an explicit
 * choice. The public shape deliberately excludes provider content.
 */
export type ProviderConflict = { target: string; providers: Pick<CatalogAsset, "path" | "label" | "stack">[] };

/**
 * The persisted, replayable representation of a user's chosen catalog state.
 *
 * Arrays are stored rather than implicit defaults so `update` can present and
 * revise the exact opt-in selection made during a previous installation.
 */
export type ManagedSelection = { stacks: string[]; profiles: string[]; assets: string[] };

type ManagedManifest = {
  version: 1 | 2;
  files: string[];
  hashes?: Record<string, string>;
  selection?: ManagedSelection;
};

/**
 * Parses only the manifest fields required to safely retain managed content.
 *
 * @param target - Repository root containing optional Agent Distro state.
 * @returns A normalized manifest, or `undefined` when no state exists.
 * @throws {Error} When persisted paths or selection data are malformed. The
 * installer must never continue from ambiguous ownership metadata.
 */
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

/**
 * Reads current or legacy ownership metadata without trusting persisted paths.
 *
 * @param target - Repository root containing optional Agent Distro state.
 * @returns The known selection, filtered to entries available in this catalog.
 * Legacy manifests retain only safe, still-known individually managed assets.
 */
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

/**
 * Narrows JSON values to mergeable object records.
 *
 * Arrays intentionally are not records: replacing or concatenating arrays is
 * policy-sensitive, so they may only agree exactly under the current rule.
 *
 * @param value - Value being tested.
 * @returns Whether `value` is a non-array object record.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Recursively merges two JSON values without mutating either input.
 *
 * @param left - Earlier provider value.
 * @param right - Later provider value.
 *
 * @returns The shared value, a new merged object, or `undefined` when two
 * providers make incompatible declarations at the same key.
 */
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

/**
 * Converts a portable catalog path into the current platform's filesystem path.
 *
 * Catalogs and manifests always use `/`; all local filesystem maps use the
 * native separator. Centralising this boundary prevents Windows map-key drift.
 *
 * @param relative - Portable catalog or manifest path.
 * @returns Native-separator path suitable for local map keys.
 */
function nativePath(relative: string) {
  return relative.split("/").join(path.sep);
}

/**
 * Converts a local filesystem map key back into its portable manifest form.
 *
 * @param relative - Native-separator local map key.
 * @returns Portable slash-separated path for a manifest.
 */
function manifestPath(relative: string) {
  return relative.split(path.sep).join("/");
}

/**
 * Computes the ownership hash recorded in the manifest for a managed file.
 *
 * @param content - Final managed file bytes.
 * @returns SHA-256 digest used for later drift detection.
 */
function contentHash(content: Buffer) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Groups providers by their final managed target while preserving catalog order.
 *
 * @param providers - Catalog providers or enriched contributions.
 * @returns Providers indexed by their portable target path.
 */
function providersByTarget<T extends CatalogAsset>(providers: T[]) {
  return providers.reduce((groups, provider) => {
    groups.set(provider.target, [...(groups.get(provider.target) ?? []), provider]);
    return groups;
  }, new Map<string, T[]>());
}

/**
 * Removes content from provider details before they cross an interactive or
 * programmatic conflict boundary.
 *
 * @param target - Shared managed target requiring a choice.
 * @param providers - Providers contributing to that target.
 * @returns Content-free conflict metadata safe for display.
 */
function describeConflict(target: string, providers: CatalogAsset[]): ProviderConflict {
  return {
    target,
    providers: providers.map(({ path, label, stack }) => ({ path, label, stack })),
  };
}

/**
 * Reads a packaged provider as a pure contribution to its declared target.
 *
 * Source path validation is repeated here at the filesystem boundary even
 * though catalog loading validates it, because package contents are untrusted
 * at runtime after installation.
 *
 * @param entry - Validated catalog provider to read from the package.
 * @returns Provider enriched with its packaged bytes.
 */
function readContribution(entry: CatalogAsset): Contribution {
  return { ...entry, content: fs.readFileSync(path.join(assets, ...manifestParts(entry.path))) };
}

/**
 * Merges a group of JSON contributions into one UTF-8 JSON file.
 *
 * @param providers - JSON providers targeting the same managed file.
 *
 * @returns A serialised JSON buffer, or `undefined` when parsing fails or any
 * nested value disagrees. The caller then requires a provider choice.
 */
function mergeJsonContributions(providers: Contribution[]): Buffer | undefined {
  try {
    const merged = providers
      .map((provider) => JSON.parse(provider.content.toString("utf8")))
      .reduce((result, value) => (result === undefined ? undefined : mergeJson(result, value)));
    return merged === undefined ? undefined : Buffer.from(JSON.stringify(merged, null, 2) + "\n");
  } catch {
    return undefined;
  }
}

/**
 * Finds declared providers that cannot safely compose without a user choice.
 *
 * @param entries - Selected catalog providers, before any target write occurs.
 * @returns One conflict per target. JSON providers are checked using the same
 * recursive merge rule used by installation, so the TUI never promises a merge
 * that the transaction cannot perform.
 */
export function providerConflicts(entries: CatalogAsset[]): ProviderConflict[] {
  return [...providersByTarget(entries)]
    .filter(([, providers]) => {
      if (providers.length < 2 || providers.some((provider) => provider.merge !== "json")) return providers.length > 1;
      return mergeJsonContributions(providers.map(readContribution)) === undefined;
    })
    .map(([target, providers]) => describeConflict(target, providers));
}

/**
 * Resolves selected providers into one immutable content map per target.
 *
 * Interactive choices win only for their named target. Without a choice,
 * compatible JSON objects merge; `force` intentionally selects the final
 * catalog provider only after the caller explicitly opts into replacement.
 *
 * @param entries - Selected catalog providers.
 * @param choices - Explicit provider source path by target.
 * @param force - Whether the final provider may replace an unresolved conflict.
 * @returns Final content indexed by portable target path.
 * @throws {Error} When an unmergeable target has no valid choice and force is
 * absent, before any target state is mutated.
 */
function resolveContributions(entries: CatalogAsset[], choices: Record<string, string>, force: boolean) {
  const groups = providersByTarget(entries.map(readContribution));
  const contents = new Map<string, Buffer>();
  const conflicts: ProviderConflict[] = [];
  for (const [target, providers] of groups) {
    if (providers.length === 1) contents.set(target, providers[0].content);
    else if (providers.every((provider) => provider.merge === "json")) {
      const merged = mergeJsonContributions(providers);
      if (merged) contents.set(target, merged);
      else conflicts.push(describeConflict(target, providers));
    } else conflicts.push(describeConflict(target, providers));
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

/**
 * Produces the human-readable inventory stored with one archive transaction.
 *
 * The record intentionally contains managed relative paths only, making it
 * safe to inspect or commit without disclosing a user's machine-specific root.
 *
 * @param files - Portable managed paths displaced by this transaction.
 * @returns Markdown inventory for the archive directory.
 */
function archiveRecord(files: string[]) {
  return `# Agent Distro archive\n\nArchived ${new Date().toISOString()} during an install or update.\n\n${files
    .map((file) => `- \`${file}\``)
    .join("\n")}\n`;
}

/**
 * Locates the durable recovery journal for one target repository.
 *
 * Keeping it below `.agent-distro/` makes an interrupted operation recoverable
 * on another terminal without relying on process memory or global state.
 *
 * @param destination - Canonical target repository directory.
 * @returns Absolute path to the target's recovery journal.
 */
function recoveryPath(destination: string) {
  return path.join(destination, ".agent-distro", recoveryFile);
}

/**
 * Restores backups left by an interrupted installation transaction.
 *
 * Recovery validates the journal and each managed path before it removes or
 * restores anything, preventing a corrupted journal from escaping the target.
 *
 * @param target - Existing repository directory that may contain a journal.
 * @returns `0` after a successful recovery or no-op; `1` after a safe failure.
 * Side effects are limited to journal-owned staging and managed output paths.
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
 *
 * @param target - Existing or new directory that will receive managed assets.
 * @param options - Explicit selection and replacement policy for this run.
 * @returns `0` on success (including dry-run/no-op) or `1` after a safe error.
 * @remarks All provider resolution and conflict checks complete before the
 * first visible target mutation. A later filesystem failure rolls back every
 * rename recorded by the durable journal.
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

  // Phase 1: resolve the declarative selection to final target content. This
  // is intentionally complete before inspecting or changing target files.
  const selectedEntries = selectedCatalogEntries(selected, profiles);
  let resolvedContents: Map<string, Buffer>;
  try {
    resolvedContents = resolveContributions(selectedEntries, providerChoices, force);
  } catch (error) {
    return fail("AGENT_DISTRO_E_CONFLICT", error instanceof Error ? error.message : String(error));
  }
  const contents = new Map([...resolvedContents].map(([target, content]) => [nativePath(target), content]));
  const sourceFiles = [...contents.keys()];

  // Phase 2: read only trusted ownership metadata. A malformed manifest must
  // fail closed rather than making a best-effort guess about managed files.
  let previous: ManagedManifest | undefined;
  try {
    previous = readManagedManifest(destination);
  } catch {
    return fail("AGENT_DISTRO_E_MANIFEST_INVALID", "invalid manifest");
  }
  const previousFiles = (previous?.files ?? []).map(nativePath);
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
      files: sourceFiles.map(manifestPath),
      hashes: Object.fromEntries(
        sourceFiles.map((relative) => [manifestPath(relative), contentHash(contents.get(relative)!)]),
      ),
    },
    null,
    2,
  ).concat("\n");
  contents.set(".agent-distro/manifest.json", Buffer.from(manifest));

  // Never traverse a symlinked ancestor: even a valid relative path could then
  // write outside the explicitly chosen target. Validate every output and
  // archive path before staging so later phases cannot escape this repository.
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
    const previousHash = previous?.hashes?.[manifestPath(relative)];
    return (
      fs.existsSync(output) &&
      !contents.get(relative).equals(fs.readFileSync(output)) &&
      !(relative === ".agent-distro/manifest.json" && previous) &&
      (!previousHash || contentHash(fs.readFileSync(output)) !== previousHash)
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
    // Phase 4: stage every new byte, then snapshot existing bytes. The journal
    // is written before the first visible rename so a later `recover` command
    // has the same rollback information as this process.
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
    // Phase 5: apply only staged replacements. Every completed replacement is
    // appended immediately, so the catch path can reverse exactly that prefix.
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
  // Phase 6: remove recoverable state only after all replacements and archives
  // are visible. Until this point an interruption remains recoverable.
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
