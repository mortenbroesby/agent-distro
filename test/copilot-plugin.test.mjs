// Marketplace contract tests: validate that the generated plugin uses the same
// Git-tracked assets as custom installation before Copilot resolves it.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const readLink = (file) => fs.readlinkSync(file).replaceAll(path.sep, "/");

describe("Copilot marketplace offering", () => {
  it("lists the same-repository plugin with strict metadata", () => {
    const marketplace = JSON.parse(read(".github/plugin/marketplace.json"));
    expect(marketplace).toMatchObject({
      name: "agent-distro-marketplace",
      owner: { name: "Morten Broesby" },
      plugins: [{ name: "agent-distro", source: "./plugins/agent-distro", version: "0.1.0", strict: true }],
    });
  });

  it("ships only shared symlinked components and optional empty templates", () => {
    const plugin = JSON.parse(read("plugins/agent-distro/plugin.json"));
    expect(plugin).toMatchObject({
      name: "agent-distro",
      agents: "agents",
      skills: "skills",
      hooks: "hooks.json",
      mcpServers: ".mcp.json",
    });
    const agentPath = path.join(root, "plugins/agent-distro/agents/agent-distro-debugging.agent.md");
    const skillPath = path.join(root, "plugins/agent-distro/skills/agent-distro-debugging/SKILL.md");
    expect(fs.lstatSync(agentPath).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(skillPath).isSymbolicLink()).toBe(true);
    expect(readLink(agentPath)).toBe("../../../assets/.github/agents/debugging.agent.md");
    expect(readLink(skillPath)).toBe("../../../../assets/.github/skills/debugging/SKILL.md");
    const agent = read("plugins/agent-distro/agents/agent-distro-debugging.agent.md");
    const skill = read("plugins/agent-distro/skills/agent-distro-debugging/SKILL.md");
    expect(agent).toContain("name: Debugging");
    expect(skill).toContain("name: agent-distro-debugging");
    expect(fs.lstatSync(path.join(root, "plugins/agent-distro/.mcp.json")).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(root, "plugins/agent-distro/hooks.json")).isSymbolicLink()).toBe(true);
  });

  it("records shared plugin assets as Git symlinks", () => {
    const listed = execFileSync("git", ["ls-files", "-s", "--", "plugins/agent-distro"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(listed).toMatch(/^120000 .+\s+plugins\/agent-distro\/\.mcp\.json$/m);
    expect(listed).toMatch(/^120000 .+\s+plugins\/agent-distro\/skills\/agent-distro-debugging\/SKILL\.md$/m);
    expect(listed).toContain("100644");
  });
});
