import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { manifestParts } from "./managed-path.js";

/** Versioned content definitions shared by the installer, TUI, and plugin generator. */
export type Profile = { id: string; label: string; description: string; assets: string[] };
type Catalog = { schemaVersion: number; version: string; assets: { path: string; label: string }[]; profiles: Profile[] };

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

/** Parses and validates generated catalog data before it can select filesystem paths. */
function loadCatalog(): Catalog {
  const catalog = JSON.parse(fs.readFileSync(path.join(assets, "catalog.json"), "utf8"));
  if (catalog.schemaVersion !== 1 || typeof catalog.version !== "string" || !Array.isArray(catalog.assets) || !Array.isArray(catalog.profiles)) throw new Error("invalid asset catalog");
  const paths = new Set<string>();
  for (const asset of catalog.assets) {
    if (typeof asset?.path !== "string" || typeof asset?.label !== "string" || paths.has(asset.path)) throw new Error("invalid asset catalog");
    manifestParts(asset.path);
    paths.add(asset.path);
  }
  for (const profile of catalog.profiles) {
    if (typeof profile?.id !== "string" || typeof profile?.label !== "string" || typeof profile?.description !== "string" || !Array.isArray(profile?.assets) || profile.assets.some((asset: unknown) => typeof asset !== "string" || !paths.has(asset))) throw new Error("invalid asset catalog");
  }
  return catalog;
}

/** Immutable validated catalog bundled with the CLI. */
export const catalog = loadCatalog();
/** Individual asset choices for command flags and interactive selection. */
export const assetChoices = catalog.assets.map(({ path, label }) => [path, label] as const);
/** Profile choices for the interactive selection flow. */
export const profileChoices = catalog.profiles.map(({ id, label, description }) => ({ id, label, description }));

/** Merges selected profiles and individual assets while preserving catalog order. */
export function selectedCatalogAssets(selected: string[], profiles: string[] = []) {
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
  return catalog.assets.filter((asset) => requested.has(asset.path)).map((asset) => asset.path);
}
