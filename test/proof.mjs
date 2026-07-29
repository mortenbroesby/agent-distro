import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = fs.mkdtempSync(path.join(os.tmpdir(), "asdlc-proof-"));
const cli = path.join(root, "bin", "asdlc.mjs");
const expected = [
  ".github/agents/asdlc.agent.md",
  ".github/hooks/asdlc.json",
  ".github/instructions/asdlc.instructions.md",
  ".github/prompts/asdlc.prompt.md",
  ".github/skills/asdlc/SKILL.md",
  ".mcp.json",
  ".asdlc/manifest.json",
];

execFileSync(process.execPath, [cli, "install", target], { stdio: "inherit" });
for (const relative of expected) assert.ok(fs.existsSync(path.join(target, relative)), relative);
execFileSync(process.execPath, [cli, "verify", target], { stdio: "inherit" });

fs.writeFileSync(path.join(target, ".mcp.json"), "changed\n");
assert.throws(() => execFileSync(process.execPath, [cli, "install", target], { stdio: "pipe" }));
execFileSync(process.execPath, [cli, "install", target, "--force"], { stdio: "inherit" });
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target, ".mcp.json"), "utf8")), { mcpServers: {} });
const beforeDryRun = fs.readFileSync(path.join(target, ".asdlc", "manifest.json"));
execFileSync(process.execPath, [cli, "install", target, "--dry-run"], { stdio: "inherit" });
assert.deepEqual(fs.readFileSync(path.join(target, ".asdlc", "manifest.json")), beforeDryRun);

console.log("macOS and Git Bash proof passed: six Copilot asset types synchronized safely.");
console.log("Windows Git Bash: run `sh test/git-bash-proof.sh`.");
