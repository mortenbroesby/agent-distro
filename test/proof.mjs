// Small dependency-free smoke proof used by CI and humans after a build. It
// invokes the packaged launcher, not internal functions, for the six bare assets.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-proof-"));
const cli = path.join(root, "bin", "agent-distro.mjs");
const expected = [
  ".github/agents/pull-request-review.agent.md",
  ".github/agents/debugging.agent.md",
  ".github/agents/handoff.agent.md",
  ".github/hooks/agent-distro.json",
  ".github/instructions/agent-distro.instructions.md",
  ".github/prompts/pull-request-review.prompt.md",
  ".github/prompts/debugging.prompt.md",
  ".github/prompts/grill-me.prompt.md",
  ".github/skills/pull-request-review/SKILL.md",
  ".github/skills/debugging/SKILL.md",
  ".github/skills/handoff/SKILL.md",
  ".mcp.json",
  ".agent-distro/manifest.json",
];

execFileSync(process.execPath, [cli, "install", target, "--all"], { stdio: "inherit" });
for (const relative of expected) assert.ok(fs.existsSync(path.join(target, relative)), relative);
execFileSync(process.execPath, [cli, "verify", target], { stdio: "inherit" });

fs.writeFileSync(path.join(target, ".mcp.json"), "changed\n");
assert.throws(() => execFileSync(process.execPath, [cli, "install", target, "--all"], { stdio: "pipe" }));
execFileSync(process.execPath, [cli, "install", target, "--all", "--force"], { stdio: "inherit" });
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target, ".mcp.json"), "utf8")), { mcpServers: {} });
const beforeDryRun = fs.readFileSync(path.join(target, ".agent-distro", "manifest.json"));
execFileSync(process.execPath, [cli, "install", target, "--all", "--dry-run"], { stdio: "inherit" });
assert.deepEqual(fs.readFileSync(path.join(target, ".agent-distro", "manifest.json")), beforeDryRun);

console.log("Node install proof passed: twelve versioned assets synchronized safely.");
