import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generates the installer catalog, curated assets, and Copilot plugin from the
 * single authored profile source. Generated files are intentionally written in
 * one place so package, CLI, and plugin content cannot diverge.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const plugin = path.join(root, "plugins", "agent-distro");
const source = JSON.parse(fs.readFileSync(path.join(assets, "profiles.json"), "utf8"));

/**
 * Normalizes a profile's short asset form into the complete provider contract.
 *
 * Source profiles use a string when source and target paths are identical and
 * replacement is intentional. Object entries make a shared target and merge
 * policy explicit before the generated catalog reaches the installer.
 */
function normalizeAsset(rawAsset) {
  return typeof rawAsset === "string" ? { path: rawAsset, target: rawAsset, merge: "replace" } : rawAsset;
}

/**
 * Renders exactly one generated asset from a validated profile provider.
 *
 * This function is deliberately pure: the caller owns the output map, while
 * this renderer makes format-specific content and unsupported file types
 * obvious in one exhaustive decision.
 */
function renderAsset(asset, profile) {
  if (asset.path.endsWith(".agent.md"))
    return (
      "---\nname: " + profile.label + "\ndescription: " + profile.description + "\n---\n\n" + profile.guidance + "\n"
    );
  if (asset.path.endsWith("/SKILL.md"))
    return (
      "---\nname: agent-distro-" +
      profile.id +
      "\ndescription: " +
      profile.description +
      "\n---\n\n" +
      profile.guidance +
      "\n"
    );
  if (asset.path.endsWith(".prompt.md"))
    return "---\ndescription: " + profile.description + "\n---\n\n" + profile.guidance + "\n";
  if (asset.path.endsWith(".instructions.md")) return "# " + profile.label + "\n\n" + profile.guidance + "\n";
  if (asset.path.endsWith(".mcp.json")) return JSON.stringify(asset.value ?? { mcpServers: {} }, null, 2) + "\n";
  if (asset.path.includes("/hooks/") && asset.path.endsWith(".json"))
    return (
      JSON.stringify(
        {
          version: 1,
          hooks:
            asset.path === ".github/hooks/agent-distro.json"
              ? {}
              : { sessionStart: [{ type: "prompt", prompt: profile.guidance }] },
        },
        null,
        2,
      ) + "\n"
    );
  throw new Error("unsupported generated asset: " + asset.path);
}

// Profiles are the single authored source. This generator emits both the
// installer catalog and the Copilot plugin so their curated content cannot drift.
if (source.version !== 1 || !source.labels || !Array.isArray(source.stacks) || !Array.isArray(source.profiles))
  throw new Error("invalid profile source");
const stacks = new Set();
for (const stack of source.stacks) {
  if (typeof stack?.id !== "string" || typeof stack?.label !== "string" || typeof stack?.description !== "string")
    throw new Error("invalid stack");
  if (stacks.has(stack.id)) throw new Error("duplicate stack");
  stacks.add(stack.id);
}
const files = new Map();
const contributions = [];
for (const profile of source.profiles) {
  if (
    typeof profile?.id !== "string" ||
    typeof profile?.stack !== "string" ||
    !stacks.has(profile.stack) ||
    typeof profile?.label !== "string" ||
    typeof profile?.description !== "string" ||
    typeof profile?.guidance !== "string" ||
    !Array.isArray(profile?.assets)
  )
    throw new Error("invalid profile");
  for (const rawAsset of profile.assets) {
    const asset = normalizeAsset(rawAsset);
    if (
      typeof asset?.path !== "string" ||
      typeof asset.target !== "string" ||
      !["replace", "json"].includes(asset.merge) ||
      !Object.hasOwn(source.labels, asset.path) ||
      files.has(asset.path)
    )
      throw new Error("invalid profile asset");
    contributions.push({ ...asset, stack: profile.stack, profile: profile.id });
    files.set(asset.path, renderAsset(asset, profile));
  }
}

const version =
  "sha256-" +
  crypto
    .createHash("sha256")
    .update(JSON.stringify([...files]))
    .digest("hex")
    .slice(0, 16);
const catalog =
  JSON.stringify(
    {
      schemaVersion: 3,
      version,
      stacks: source.stacks,
      assets: contributions.map(({ path: asset, target, merge, stack }) => ({
        path: asset,
        target,
        merge,
        label: source.labels[asset],
        stack,
      })),
      profiles: source.profiles.map(({ id, stack, label, description, assets: profileAssets }) => ({
        id,
        stack,
        label,
        description,
        assets: profileAssets.map((asset) => (typeof asset === "string" ? asset : asset.path)),
      })),
    },
    null,
    2,
  ) + "\n";
const expected = new Map([...files, ["catalog.json", catalog]]);

// Plugin metadata is unique, but every distributable component is a Git-tracked
// relative symlink into assets/. A future APM package can consume that same tree
// without creating a third copy of the curated content.
const pluginFiles = new Map([
  [
    "plugin.json",
    JSON.stringify(
      {
        name: "agent-distro",
        description:
          "Curated Copilot agents, skills, and optional MCP and hook templates for evidence-driven engineering workflows.",
        version: "0.1.0",
        author: { name: "Morten Broesby", url: "https://github.com/mortenbroesby" },
        homepage: "https://github.com/mortenbroesby/agent-distro",
        repository: "https://github.com/mortenbroesby/agent-distro",
        keywords: ["github-copilot", "agents", "skills", "hooks", "mcp"],
        agents: "agents",
        skills: "skills",
        hooks: "hooks.json",
        mcpServers: ".mcp.json",
      },
      null,
      2,
    ) + "\n",
  ],
]);
const pluginLinks = new Map([
  ["hooks.json", path.join(assets, ".github/hooks/agent-distro.json")],
  [".mcp.json", path.join(assets, ".mcp.json")],
]);
for (const profile of source.profiles) {
  for (const rawAsset of profile.assets) {
    const asset = normalizeAsset(rawAsset).path;
    if (asset.endsWith(".agent.md"))
      pluginLinks.set("agents/agent-distro-" + profile.id + ".agent.md", path.join(assets, asset));
    if (asset.endsWith("/SKILL.md"))
      pluginLinks.set("skills/agent-distro-" + profile.id + "/SKILL.md", path.join(assets, asset));
  }
}
const marketplace =
  JSON.stringify(
    {
      name: "agent-distro-marketplace",
      owner: { name: "Morten Broesby" },
      metadata: { description: "Curated GitHub Copilot workflow plugins from Agent Distro.", version: "0.1.0" },
      plugins: [
        {
          name: "agent-distro",
          source: "./plugins/agent-distro",
          description:
            "Curated agents, skills, and optional MCP and hook templates for evidence-driven engineering workflows.",
          version: "0.1.0",
          strict: true,
        },
      ],
    },
    null,
    2,
  ) + "\n";
pluginFiles.set(".github/plugin/marketplace.json", marketplace);

const check = process.argv.includes("--check");
for (const [relative, content] of expected) {
  const output = path.join(assets, relative);
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== content)
      throw new Error("generated asset is stale: " + relative);
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, content);
  }
}
for (const [relative, content] of pluginFiles) {
  const output =
    relative === ".github/plugin/marketplace.json" ? path.join(root, relative) : path.join(plugin, relative);
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== content)
      throw new Error("generated Copilot plugin is stale: " + relative);
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, content);
  }
}
for (const [relative, target] of pluginLinks) {
  const output = path.join(plugin, relative);
  const link = path.relative(path.dirname(output), target);
  if (check) {
    if (!fs.lstatSync(output).isSymbolicLink() || fs.readlinkSync(output) !== link)
      throw new Error("generated Copilot plugin symlink is stale: " + relative);
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.rmSync(output, { force: true });
    fs.symlinkSync(link, output);
  }
}
// These were generated copies before the shared-asset design. Refuse to leave
// them behind so the plugin has one authoritative content source.
for (const relative of ["README.md", "skills/agent-distro-foundation/SKILL.md"]) {
  const output = path.join(plugin, relative);
  if (check && fs.existsSync(output)) throw new Error("duplicate Copilot plugin asset: " + relative);
  if (!check) fs.rmSync(output, { force: true });
}
