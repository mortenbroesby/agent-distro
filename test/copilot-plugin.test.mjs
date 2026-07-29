// Marketplace contract tests: validate the generated same-repository plugin
// before Copilot CLI resolves it from a local path or GitHub marketplace.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Copilot marketplace offering", () => {
  it("lists the same-repository plugin with strict metadata", () => {
    const marketplace = JSON.parse(read(".github/plugin/marketplace.json"));
    expect(marketplace).toMatchObject({
      name: "agent-distro-marketplace",
      owner: { name: "Morten Broesby" },
      plugins: [{ name: "agent-distro", source: "./plugins/agent-distro", version: "0.1.0", strict: true }],
    });
  });

  it("ships only uniquely named Copilot components and optional empty templates", () => {
    const plugin = JSON.parse(read("plugins/agent-distro/plugin.json"));
    expect(plugin).toMatchObject({
      name: "agent-distro",
      agents: "agents",
      skills: "skills",
      hooks: "hooks.json",
      mcpServers: ".mcp.json",
    });
    const agent = read("plugins/agent-distro/agents/agent-distro-debugging.agent.md");
    const skill = read("plugins/agent-distro/skills/agent-distro-debugging/SKILL.md");
    expect(agent).toContain("name: Debugging");
    expect(skill).toContain("name: agent-distro-debugging");
    expect(JSON.parse(read("plugins/agent-distro/.mcp.json"))).toEqual({ mcpServers: {} });
    expect(JSON.parse(read("plugins/agent-distro/hooks.json"))).toEqual({ version: 1, hooks: {} });
  });
});
