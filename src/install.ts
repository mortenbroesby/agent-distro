import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "./errors.js";
import { hasSymlinkAncestor, manifestParts } from "./managed-path.js";

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
const recoveryFile = ".agent-distro-recovery.json";

export const assetChoices = [
  [".github/agents/agent-distro.agent.md", "Agent"],
  [".github/hooks/agent-distro.json", "Hook"],
  [".github/instructions/agent-distro.instructions.md", "Instructions"],
  [".github/prompts/agent-distro.prompt.md", "Prompt"],
  [".github/skills/agent-distro/SKILL.md", "Skill"],
  [".mcp.json", "MCP configuration"],
] as const;

function recoveryPath(destination: string) {
  return path.join(destination, ".agent-distro", recoveryFile);
}

function selectedAssets(selected: string[]) {
  const choices = new Set(assetChoices.map(([value]) => value));
  const unknown = selected.filter((value) => !choices.has(value));
  if (unknown.length) throw new Error(`unknown asset: ${unknown.join(", ")}`);
  return selected.map((value) => value.split("/").join(path.sep));
}

export function recover(target: string) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  const destination = fs.realpathSync(target);
  const journalPath = recoveryPath(destination);
  if (!fs.existsSync(journalPath)) {
    console.log("No Agent Distro recovery is needed.");
    return 0;
  }
  try {
    if (hasSymlinkAncestor(destination, path.join(".agent-distro", recoveryFile))) throw new Error("unsafe recovery journal");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    if (journal.version !== 1 || typeof journal.staging !== "string" || !journal.staging.startsWith(".agent-distro-stage-") || journal.staging.includes(path.sep) || !Array.isArray(journal.files)) throw new Error("invalid recovery journal");
    const staging = path.join(destination, ".agent-distro", journal.staging);
    for (const file of [...journal.files].reverse()) {
      const parts = manifestParts(file?.relative);
      const output = path.join(destination, ...parts);
      const backup = path.join(staging, ".backup", ...parts);
      if (file?.hadPrevious) {
        if (!fs.existsSync(backup)) throw new Error("recovery backup missing");
        fs.rmSync(output, { force: true });
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.renameSync(backup, output);
      } else fs.rmSync(output, { force: true });
    }
    fs.rmSync(journalPath, { force: true });
    fs.rmSync(staging, { recursive: true, force: true });
    console.log("Recovered the previous Agent Distro installation.");
    return 0;
  } catch (error) {
    return fail("AGENT_DISTRO_E_MANIFEST_INVALID", error instanceof Error ? error.message : String(error));
  }
}

export function install(target: string, { force = false, dryRun = false, selected = [] }: { force?: boolean; dryRun?: boolean; selected?: string[] }) {
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  const destination = fs.existsSync(target) ? fs.realpathSync(target) : path.resolve(target);
  if (fs.existsSync(recoveryPath(destination))) return fail("AGENT_DISTRO_E_RECOVERY_REQUIRED", "An incomplete Agent Distro transaction needs recovery.");
  const sourceFiles = selectedAssets(selected);
  const outputFiles = [...sourceFiles, ".agent-distro/manifest.json"];
  const manifest = JSON.stringify({
    tool: "agent-distro",
    version: 1,
    files: sourceFiles.map((relative) => relative.split(path.sep).join("/")),
    hashes: Object.fromEntries(sourceFiles.map((relative) => [relative.split(path.sep).join("/"), crypto.createHash("sha256").update(fs.readFileSync(path.join(assets, relative))).digest("hex")])),
  }, null, 2).concat("\n");
  const contents = new Map(sourceFiles.map((relative) => [relative, fs.readFileSync(path.join(assets, relative))]));
  contents.set(".agent-distro/manifest.json", Buffer.from(manifest));
  const unsafe = outputFiles.filter((relative) => hasSymlinkAncestor(destination, relative));
  if (unsafe.length) return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", `Refusing symlinked managed paths: ${unsafe.join(", ")}`);
  const directories = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    return fs.existsSync(output) && !fs.lstatSync(output).isFile();
  });
  if (directories.length) return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", `Refusing non-file managed paths: ${directories.join(", ")}`);
  const conflicts = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    return fs.existsSync(output) && !contents.get(relative).equals(fs.readFileSync(output));
  });
  if (conflicts.length && !force) return fail("AGENT_DISTRO_E_CONFLICT", `Refusing to overwrite: ${conflicts.join(", ")}`);
  const changed = outputFiles.filter((relative) => !fs.existsSync(path.join(destination, relative)) || conflicts.includes(relative));
  console.log(`${dryRun ? "Would sync" : "Synced"} ${changed.length} changed assets to ${destination}`);
  if (dryRun) return 0;
  let staging = "";
  const replacements: { relative: string; output: string; backup?: string }[] = [];
  const committed: typeof replacements = [];
  try {
    fs.mkdirSync(path.join(destination, ".agent-distro"), { recursive: true });
    staging = fs.mkdtempSync(path.join(destination, ".agent-distro", ".agent-distro-stage-"));
    for (const relative of changed) {
      const staged = path.join(staging, relative);
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.writeFileSync(staged, contents.get(relative));
    }
    for (const relative of changed) {
      const output = path.join(destination, relative);
      const backup = path.join(staging, ".backup", relative);
      if (fs.existsSync(output)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(output, backup);
      }
      replacements.push({ relative, output, backup: fs.existsSync(output) ? backup : undefined });
    }
    fs.writeFileSync(recoveryPath(destination), JSON.stringify({ version: 1, staging: path.basename(staging), files: replacements.map(({ relative, backup }) => ({ relative, hadPrevious: Boolean(backup) })) }));
    for (const replacement of replacements) {
      fs.mkdirSync(path.dirname(replacement.output), { recursive: true });
      fs.renameSync(path.join(staging, replacement.relative), replacement.output);
      committed.push(replacement);
    }
  } catch (error) {
    for (const { output, backup } of committed.reverse()) {
      if (backup && fs.existsSync(backup)) {
        fs.rmSync(output, { force: true });
        fs.renameSync(backup, output);
      } else fs.rmSync(output, { force: true });
    }
    fs.rmSync(recoveryPath(destination), { force: true });
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    return fail("AGENT_DISTRO_E_UNEXPECTED", error instanceof Error ? error.message : String(error));
  }
  fs.rmSync(recoveryPath(destination), { force: true });
  fs.rmSync(staging, { recursive: true, force: true });
  return 0;
}

export async function interactiveInstall(target?: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return fail("AGENT_DISTRO_E_USAGE", "Interactive install requires a terminal; use --asset <path...> or --all.");
  const p = await import("@clack/prompts");
  p.intro("Agent Distro install");
  const destination = target ?? await p.text({ message: "Install into", initialValue: process.cwd(), validate: (value) => value ? undefined : "A target directory is required." });
  if (p.isCancel(destination)) {
    p.cancel("Installation cancelled.");
    return 0;
  }
  const selected = await p.multiselect({ message: "Select assets to install", options: assetChoices.map(([value, label]) => ({ value, label, hint: value })), required: false });
  if (p.isCancel(selected)) {
    p.cancel("Installation cancelled.");
    return 0;
  }
  if (selected.length === 0) {
    p.outro("No assets selected; nothing changed.");
    return 0;
  }
  const code = install(destination, { selected });
  if (code === 0) p.outro("Installation complete.");
  return code;
}
