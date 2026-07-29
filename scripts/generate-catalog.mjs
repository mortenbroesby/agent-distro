import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const source = JSON.parse(fs.readFileSync(path.join(assets, "profiles.json"), "utf8"));

if (source.version !== 1 || !source.labels || !Array.isArray(source.profiles)) throw new Error("invalid profile source");
const assetPaths = Object.keys(source.labels);
for (const asset of assetPaths) {
  const sourcePath = path.resolve(assets, asset);
  if (!sourcePath.startsWith(assets + path.sep) || !fs.existsSync(sourcePath)) throw new Error("invalid profile asset: " + asset);
}
for (const profile of source.profiles) {
  if (!Array.isArray(profile?.assets) || profile.assets.some((asset) => !Object.hasOwn(source.labels, asset))) {
    throw new Error("invalid profile reference");
  }
}

const output = JSON.stringify({
  version: source.version,
  assets: assetPaths.map((asset) => ({ path: asset, label: source.labels[asset] })),
  profiles: source.profiles,
}, null, 2) + "\n";
const destination = path.join(assets, "catalog.json");

if (process.argv.includes("--check")) {
  if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== output) {
    throw new Error("assets/catalog.json is stale; run npm run catalog:generate");
  }
} else {
  fs.writeFileSync(destination, output);
}
