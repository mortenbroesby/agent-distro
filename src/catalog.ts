import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { manifestParts } from "./managed-path.js";

/**
 * A selectable technology stack.
 *
 * Stack metadata is presentation-only, but its stable `id` scopes profiles and
 * assets during interactive installation. It must therefore remain safe to
 * persist in a target manifest.
 */
export type Stack = { id: string; label: string; description: string };
/**
 * A named collection of assets belonging to exactly one stack.
 *
 * Profiles are convenience selections, not an ownership mechanism: every
 * listed asset still declares its own stack in the generated catalog.
 */
export type Profile = { id: string; stack: string; label: string; description: string; assets: string[] };
/**
 * A generated provider that contributes content to a managed target path.
 *
 * `path` locates the packaged source, while `target` is the repository path
 * that receives it. Keeping those identities distinct allows several stacks
 * to safely contribute to one target. `merge` is deliberately closed so an
 * unrecognised rule can never silently alter a user's repository.
 */
export type CatalogAsset = { path: string; target: string; merge: "replace" | "json"; label: string; stack: string };
type Catalog = {
  schemaVersion: number;
  version: string;
  stacks: Stack[];
  assets: CatalogAsset[];
  profiles: Profile[];
};

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

/**
 * Loads and validates the generated catalog bundled beside the compiled CLI.
 *
 * @returns A catalog whose paths, stack references, and profile references are
 * validated before they can influence filesystem operations.
 * @throws {Error} When generated data is stale, malformed, or unsafe. Failing
 * eagerly turns a packaging defect into a safe startup failure.
 */
function loadCatalog(): Catalog {
  const catalog = JSON.parse(fs.readFileSync(path.join(assets, "catalog.json"), "utf8"));
  if (
    catalog.schemaVersion !== 3 ||
    typeof catalog.version !== "string" ||
    !Array.isArray(catalog.stacks) ||
    !Array.isArray(catalog.assets) ||
    !Array.isArray(catalog.profiles)
  )
    throw new Error("invalid asset catalog");
  const stacks = new Set<string>();
  for (const stack of catalog.stacks) {
    if (typeof stack?.id !== "string" || typeof stack?.label !== "string" || typeof stack?.description !== "string")
      throw new Error("invalid asset catalog");
    if (stacks.has(stack.id)) throw new Error("invalid asset catalog");
    stacks.add(stack.id);
  }
  const paths = new Set<string>();
  for (const asset of catalog.assets) {
    if (
      typeof asset?.path !== "string" ||
      typeof asset?.target !== "string" ||
      !["replace", "json"].includes(asset?.merge) ||
      typeof asset?.label !== "string" ||
      typeof asset?.stack !== "string" ||
      !stacks.has(asset.stack) ||
      paths.has(asset.path)
    )
      throw new Error("invalid asset catalog");
    manifestParts(asset.path);
    manifestParts(asset.target);
    paths.add(asset.path);
  }
  for (const profile of catalog.profiles) {
    if (
      typeof profile?.id !== "string" ||
      typeof profile?.stack !== "string" ||
      !stacks.has(profile.stack) ||
      typeof profile?.label !== "string" ||
      typeof profile?.description !== "string" ||
      !Array.isArray(profile?.assets) ||
      profile.assets.some((asset: unknown) => typeof asset !== "string" || !paths.has(asset))
    )
      throw new Error("invalid asset catalog");
  }
  return catalog;
}

/** Immutable validated catalog bundled with the CLI. */
export const catalog = loadCatalog();
/** Individual asset choices for command flags and interactive selection. */
export const assetChoices = catalog.assets.map(({ path, label }) => [path, label] as const);
/** Stack choices for the first step of interactive installation. */
export const stackChoices = catalog.stacks;
/** Profile choices for the interactive selection flow. */
export const profileChoices = catalog.profiles.map(({ id, stack, label, description }) => ({
  id,
  stack,
  label,
  description,
}));

/**
 * Resolves selected providers to their source paths in stable catalog order.
 *
 * @param selected - Individually selected provider source paths.
 * @param profiles - Profile identifiers whose providers are added to `selected`.
 * @returns Source paths suitable for command-line reporting and manifest input.
 * @throws {Error} When a profile or asset is absent from the validated catalog.
 */
export function selectedCatalogAssets(selected: string[], profiles: string[] = []) {
  return selectedCatalogEntries(selected, profiles).map((asset) => asset.path);
}

/**
 * Resolves selected providers without discarding their target or merge rule.
 *
 * This is the installer-facing counterpart to {@link selectedCatalogAssets}.
 * It is intentionally pure: profile expansion and unknown-selection rejection
 * happen before any source file is read or target state is inspected.
 *
 * @param selected - Individually selected provider source paths.
 * @param profiles - Profile identifiers whose providers are added to `selected`.
 * @returns Catalog entries in deterministic catalog order.
 * @throws {Error} When a requested profile or provider is unknown.
 */
export function selectedCatalogEntries(selected: string[], profiles: string[] = []) {
  const requested = new Set(selected);
  const profilesById = new Map(catalog.profiles.map((profile) => [profile.id, profile]));
  for (const profile of profiles) {
    const entry = profilesById.get(profile);
    if (!entry) throw new Error(`unknown profile: ${profile}`);
    for (const asset of entry.assets) requested.add(asset);
  }
  const available = new Set(catalog.assets.map((asset) => asset.path));
  const unknown = [...requested].filter((asset) => !available.has(asset));
  if (unknown.length) throw new Error(`unknown asset: ${unknown.join(", ")}`);
  return catalog.assets.filter((asset) => requested.has(asset.path));
}
