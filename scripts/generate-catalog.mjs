import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const source = JSON.parse(fs.readFileSync(path.join(assets, "profiles.json"), "utf8"));

if (source.version !== 1 || !source.labels || !Array.isArray(source.profiles)) throw new Error("invalid profile source");
const files = new Map();
for (const profile of source.profiles) {
  if (typeof profile?.id !== "string" || typeof profile?.label !== "string" || typeof profile?.description !== "string" || typeof profile?.guidance !== "string" || !Array.isArray(profile?.assets)) throw new Error("invalid profile");
  for (const asset of profile.assets) {
    if (typeof asset !== "string" || !Object.hasOwn(source.labels, asset) || files.has(asset)) throw new Error("invalid profile asset");
    if (asset.endsWith(".agent.md")) files.set(asset, "---\nname: " + profile.label + "\ndescription: " + profile.description + "\n---\n\n" + profile.guidance + "\n");
    else if (asset.endsWith("/SKILL.md")) files.set(asset, "---\nname: " + profile.id + "\ndescription: " + profile.description + "\n---\n\n" + profile.guidance + "\n");
    else if (asset.endsWith(".prompt.md")) files.set(asset, "---\ndescription: " + profile.description + "\n---\n\n" + profile.guidance + "\n");
    else if (asset.endsWith(".instructions.md")) files.set(asset, "# " + profile.label + "\n\n" + profile.guidance + "\n");
    else if (asset === ".mcp.json") files.set(asset, JSON.stringify({ mcpServers: {} }, null, 2) + "\n");
    else if (asset.includes("/hooks/") && asset.endsWith(".json")) files.set(asset, JSON.stringify({ version: 1, hooks: asset === ".github/hooks/agent-distro.json" ? {} : { sessionStart: [{ type: "prompt", prompt: profile.guidance }] } }, null, 2) + "\n");
    else throw new Error("unsupported generated asset: " + asset);
  }
}

const version = "sha256-" + crypto.createHash("sha256").update(JSON.stringify([...files])).digest("hex").slice(0, 16);
const catalog = JSON.stringify({
  schemaVersion: 1,
  version,
  assets: [...files.keys()].map((asset) => ({ path: asset, label: source.labels[asset] })),
  profiles: source.profiles.map(({ id, label, description, assets: profileAssets }) => ({ id, label, description, assets: profileAssets })),
}, null, 2) + "\n";
const expected = new Map([...files, ["catalog.json", catalog]]);
const check = process.argv.includes("--check");
for (const [relative, content] of expected) {
  const output = path.join(assets, relative);
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== content) throw new Error("generated asset is stale: " + relative);
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, content);
  }
}
