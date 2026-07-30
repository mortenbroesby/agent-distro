// Contributor-agent contract: keeps the local workflow catalog documented,
// licensed, and outside the npm package without introducing a runtime feature.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, ".agents", "skills");

/** Returns the sorted skill IDs that have a repository-local workflow file. */
function localSkillNames() {
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

/** Extracts the code-formatted skill IDs from a documented table or bullet list. */
function documentedSkillNames(text, expression) {
  return [...text.matchAll(expression)].map((match) => match[1]).sort();
}

const skillNames = localSkillNames();
const skillsReadme = fs.readFileSync(path.join(skillsRoot, "README.md"), "utf8");
const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const skillAgreement = agents.split("## Concurrent worktrees", 1)[0];

assert.ok(skillNames.length > 0, "Expected at least one contributor skill.");
assert.deepEqual(
  documentedSkillNames(skillsReadme, /^\| `([^`]+)` \|/gm),
  skillNames,
  ".agents/skills/README.md must document every local skill exactly once.",
);
assert.deepEqual(
  documentedSkillNames(skillAgreement, /^- `([^`]+)`/gm),
  skillNames,
  "AGENTS.md must route to every local skill exactly once.",
);
assert.deepEqual(
  packageJson.files,
  ["bin", "dist", "scripts/upgrade.mjs"],
  "The npm package must keep contributor-only .agents content outside its package boundary and include its runtime upgrade script.",
);
for (const license of ["addy-osmani-MIT.txt", "superpowers-MIT.txt"])
  assert.ok(fs.existsSync(path.join(skillsRoot, "licenses", license)), `Missing skill license: ${license}`);

console.log("Agent contributor surface verified.");
