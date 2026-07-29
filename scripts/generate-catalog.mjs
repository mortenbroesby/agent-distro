import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const plugin = path.join(root, "plugins", "agent-distro");
const source = JSON.parse(fs.readFileSync(path.join(assets, "profiles.json"), "utf8"));

// Profiles are the single authored source. This generator emits both the
// installer catalog and the Copilot plugin so their curated content cannot drift.
if (source.version !== 1 || !source.labels || !Array.isArray(source.profiles))
  throw new Error("invalid profile source");
const files = new Map();
for (const profile of source.profiles) {
  if (
    typeof profile?.id !== "string" ||
    typeof profile?.label !== "string" ||
    typeof profile?.description !== "string" ||
    typeof profile?.guidance !== "string" ||
    !Array.isArray(profile?.assets)
  )
    throw new Error("invalid profile");
  for (const asset of profile.assets) {
    if (typeof asset !== "string" || !Object.hasOwn(source.labels, asset) || files.has(asset))
      throw new Error("invalid profile asset");
    if (asset.endsWith(".agent.md"))
      files.set(
        asset,
        "---\nname: " + profile.label + "\ndescription: " + profile.description + "\n---\n\n" + profile.guidance + "\n",
      );
    else if (asset.endsWith("/SKILL.md"))
      files.set(
        asset,
        "---\nname: " + profile.id + "\ndescription: " + profile.description + "\n---\n\n" + profile.guidance + "\n",
      );
    else if (asset.endsWith(".prompt.md"))
      files.set(asset, "---\ndescription: " + profile.description + "\n---\n\n" + profile.guidance + "\n");
    else if (asset.endsWith(".instructions.md"))
      files.set(asset, "# " + profile.label + "\n\n" + profile.guidance + "\n");
    else if (asset === ".mcp.json") files.set(asset, JSON.stringify({ mcpServers: {} }, null, 2) + "\n");
    else if (asset.includes("/hooks/") && asset.endsWith(".json"))
      files.set(
        asset,
        JSON.stringify(
          {
            version: 1,
            hooks:
              asset === ".github/hooks/agent-distro.json"
                ? {}
                : { sessionStart: [{ type: "prompt", prompt: profile.guidance }] },
          },
          null,
          2,
        ) + "\n",
      );
    else throw new Error("unsupported generated asset: " + asset);
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
      schemaVersion: 1,
      version,
      assets: [...files.keys()].map((asset) => ({ path: asset, label: source.labels[asset] })),
      profiles: source.profiles.map(({ id, label, description, assets: profileAssets }) => ({
        id,
        label,
        description,
        assets: profileAssets,
      })),
    },
    null,
    2,
  ) + "\n";
const expected = new Map([...files, ["catalog.json", catalog]]);

/** Creates a unique plugin component from a profile without sharing generic IDs. */
function pluginProfile(profile, kind) {
  const frontMatter =
    kind === "agent"
      ? "---\nname: " + profile.label + "\ndescription: " + profile.description + "\n---\n\n"
      : "---\nname: agent-distro-" + profile.id + "\ndescription: " + profile.description + "\n---\n\n";
  return frontMatter + profile.guidance + "\n";
}

// Copilot plugins load agents and skills by identifier. Prefixing every
// generated component prevents a user's project-level debugging skill or agent
// from being silently shadowed by this optional marketplace offering.
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
  [
    "README.md",
    "# Agent Distro for GitHub Copilot\n\nInstall curated, evidence-driven agents and skills from the Agent Distro marketplace. The plugin includes empty MCP and hook templates; configure them deliberately after installation.\n\n## Install\n\n```sh\ncopilot plugin marketplace add mortenbroesby/agent-distro\ncopilot plugin install agent-distro@agent-distro-marketplace\n```\n\nFor a direct development install, use:\n\n```sh\ncopilot plugin install mortenbroesby/agent-distro:plugins/agent-distro\n```\n",
  ],
  ["hooks.json", files.get(".github/hooks/agent-distro.json")],
  [".mcp.json", files.get(".mcp.json")],
]);
for (const profile of source.profiles) {
  if (profile.id === "foundation")
    pluginFiles.set("skills/agent-distro-foundation/SKILL.md", pluginProfile(profile, "skill"));
  if (profile.assets.some((asset) => asset.endsWith(".agent.md")))
    pluginFiles.set("agents/agent-distro-" + profile.id + ".agent.md", pluginProfile(profile, "agent"));
  if (profile.assets.some((asset) => asset.endsWith("/SKILL.md")))
    pluginFiles.set("skills/agent-distro-" + profile.id + "/SKILL.md", pluginProfile(profile, "skill"));
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
