#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const issueUrl = "https://github.com/mortenbroesby/agent-distro/issues/new";

type FailureCode =
  | "AGENT_DISTRO_E_TARGET_INVALID"
  | "AGENT_DISTRO_E_DESTINATION_UNSAFE"
  | "AGENT_DISTRO_E_CONFLICT"
  | "AGENT_DISTRO_E_RECOVERY_REQUIRED"
  | "AGENT_DISTRO_E_MANIFEST_INVALID"
  | "AGENT_DISTRO_E_ASSET_DRIFT"
  | "AGENT_DISTRO_E_USAGE"
  | "AGENT_DISTRO_E_UNEXPECTED";

const nextSteps: Record<FailureCode, string> = {
  AGENT_DISTRO_E_TARGET_INVALID: "Pass an existing directory as <target>.",
  AGENT_DISTRO_E_DESTINATION_UNSAFE: "Choose a target without symlinked or directory conflicts.",
  AGENT_DISTRO_E_CONFLICT: "Review changed files, then rerun with --force if replacement is intended.",
  AGENT_DISTRO_E_RECOVERY_REQUIRED: "Run agent-distro recover <target>, then retry the install.",
  AGENT_DISTRO_E_MANIFEST_INVALID: "Reinstall Agent Distro assets with --force, then run verify again.",
  AGENT_DISTRO_E_ASSET_DRIFT: "Review managed assets, then rerun install with --force if replacement is intended.",
  AGENT_DISTRO_E_USAGE: "Run agent-distro --help for valid commands and options.",
  AGENT_DISTRO_E_UNEXPECTED: "Run agent-distro diagnostics <target>; if it persists, run agent-distro report-issue --diagnostics-consent --message \"describe the failure\".",
};

function sanitize(value: unknown) {
  return String(value)
    .replace(/(?:ghp|github_pat|npm)_[A-Za-z0-9_\-]+/g, "[redacted]")
    .replace(/(?:token|password|secret|authorization)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .replace(/(?:\/Users\/[^\s:]+|\/home\/[^\s:]+|[A-Z]:\\[^\s:]+)/g, "[local-path]")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

export function formatFailure(code: FailureCode, message: unknown) {
  return `${code}: ${sanitize(message)}\nNext: ${nextSteps[code]}`;
}

export function createIssueUrl({
  message,
  action = "unknown",
  code = "AGENT_DISTRO_E_UNEXPECTED",
}: { message: unknown; action?: unknown; code?: unknown }) {
  const body = [
    "<!-- Generated locally. Review before submitting. -->",
    `Agent Distro: ${version}`,
    `Node: ${process.versions.node}`,
    `Platform: ${process.platform} ${process.arch}`,
    `Action: ${sanitize(action)}`,
    `Code: ${sanitize(code)}`,
    `Failure: ${sanitize(message)}`,
  ].join("\n");
  return `${issueUrl}?${new URLSearchParams({ title: "Agent Distro failure", body }).toString()}`;
}

function fail(code: FailureCode, message: unknown) {
  console.error(formatFailure(code, message));
  return 1;
}

function hasSymlinkAncestor(root: string, relative: string) {
  let current = root;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

function manifestParts(relative: unknown) {
  if (typeof relative !== "string" || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) {
    throw new Error(`unsafe manifest path: ${relative}`);
  }
  const parts = relative.split(/[\\\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`unsafe manifest path: ${relative}`);
  }
  return parts;
}

const recoveryFile = ".agent-distro-recovery.json";

function recoveryPath(destination: string) {
  return path.join(destination, ".agent-distro", recoveryFile);
}

export function recover(target: string) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  }
  const destination = fs.realpathSync(target);
  const journalPath = recoveryPath(destination);
  if (!fs.existsSync(journalPath)) {
    console.log("No Agent Distro recovery is needed.");
    return 0;
  }
  try {
    if (hasSymlinkAncestor(destination, path.join(".agent-distro", recoveryFile))) throw new Error("unsafe recovery journal");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    if (journal.version !== 1 || typeof journal.staging !== "string" || !journal.staging.startsWith(".agent-distro-stage-") || journal.staging.includes(path.sep) || !Array.isArray(journal.files)) {
      throw new Error("invalid recovery journal");
    }
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
      } else {
        fs.rmSync(output, { force: true });
      }
    }
    fs.rmSync(journalPath, { force: true });
    fs.rmSync(staging, { recursive: true, force: true });
    console.log("Recovered the previous Agent Distro installation.");
    return 0;
  } catch (error) {
    return fail("AGENT_DISTRO_E_MANIFEST_INVALID", error instanceof Error ? error.message : String(error));
  }
}

function verify(target: string) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  }
  const destination = fs.realpathSync(target);
  const manifestPath = path.join(destination, ".agent-distro", "manifest.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.tool !== "agent-distro" || manifest.version !== 1 || !Array.isArray(manifest.files)) {
      throw new Error("invalid manifest");
    }
    for (const relative of manifest.files) {
      const parts = manifestParts(relative);
      if (hasSymlinkAncestor(destination, parts.join(path.sep))) throw new Error(`symlinked asset path: ${relative}`);
      const output = path.join(destination, ...parts);
      if (!fs.existsSync(output) || !fs.statSync(output).isFile()) {
        throw new Error(`missing asset: ${relative}`);
      }
      const hash = crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex");
      if (manifest.hashes?.[relative] !== hash) throw new Error(`changed asset: ${relative}`);
    }
    console.log(`Verified ${manifest.files.length} assets in ${destination}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(
      message.startsWith("missing asset:") || message.startsWith("changed asset:")
        ? "AGENT_DISTRO_E_ASSET_DRIFT"
        : "AGENT_DISTRO_E_MANIFEST_INVALID",
      message,
    );
  }
}

function diagnostics(target: string) {
  const snapshot = {
    version,
    runtime: { node: process.versions.node, platform: process.platform, arch: process.arch },
    target: { exists: fs.existsSync(target), directory: false },
    manifest: { present: false, valid: false, assetCount: 0 },
  };
  if (!snapshot.target.exists) {
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
    return 0;
  }
  snapshot.target.directory = fs.statSync(target).isDirectory();
  if (!snapshot.target.directory) {
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
    return 0;
  }
  const manifestPath = path.join(fs.realpathSync(target), ".agent-distro", "manifest.json");
  snapshot.manifest.present = fs.existsSync(manifestPath);
  if (snapshot.manifest.present) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      snapshot.manifest.valid = manifest.tool === "agent-distro" && manifest.version === 1 && Array.isArray(manifest.files);
      snapshot.manifest.assetCount = Array.isArray(manifest.files) ? manifest.files.length : 0;
    } catch {
      // Diagnostics must remain available when the manifest is malformed.
    }
  }
  process.stdout.write(`${JSON.stringify(snapshot)}\n`);
  return 0;
}

function reportIssue({
  diagnosticsConsent,
  message,
  action,
  code,
}: { diagnosticsConsent?: boolean; message?: string; action?: string; code?: string }) {
  if (!diagnosticsConsent) return fail("AGENT_DISTRO_E_USAGE", "Issue reporting requires --diagnostics-consent.");
  if (!message) return fail("AGENT_DISTRO_E_USAGE", "Issue reporting requires --message <summary>.");
  process.stdout.write(`${createIssueUrl({ message, action, code })}\n`);
  return 0;
}

const assetChoices = [
  [".github/agents/agent-distro.agent.md", "Agent"],
  [".github/hooks/agent-distro.json", "Hook"],
  [".github/instructions/agent-distro.instructions.md", "Instructions"],
  [".github/prompts/agent-distro.prompt.md", "Prompt"],
  [".github/skills/agent-distro/SKILL.md", "Skill"],
  [".mcp.json", "MCP configuration"],
] as const;

function selectedAssets(selected: string[]) {
  const choices = new Set(assetChoices.map(([value]) => value));
  const unknown = selected.filter((value) => !choices.has(value));
  if (unknown.length) throw new Error(`unknown asset: ${unknown.join(", ")}`);
  return selected.map((value) => value.split("/").join(path.sep));
}

export function install(target: string, { force = false, dryRun = false, selected = [] }: { force?: boolean; dryRun?: boolean; selected?: string[] }) {
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    return fail("AGENT_DISTRO_E_TARGET_INVALID", "Target is not a directory.");
  }
  const destination = fs.existsSync(target)
    ? fs.realpathSync(target)
    : path.resolve(target);
  if (fs.existsSync(recoveryPath(destination))) {
    return fail("AGENT_DISTRO_E_RECOVERY_REQUIRED", "An incomplete Agent Distro transaction needs recovery.");
  }
  const sourceFiles = selectedAssets(selected);
  const manifestPath = path.join(destination, ".agent-distro", "manifest.json");
  const outputFiles = [...sourceFiles, ".agent-distro/manifest.json"];
  const manifest = JSON.stringify(
    {
      tool: "agent-distro",
      version: 1,
      files: sourceFiles.map((relative) => relative.split(path.sep).join("/")),
      hashes: Object.fromEntries(
        sourceFiles.map((relative) => [
          relative.split(path.sep).join("/"),
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(assets, relative)))
            .digest("hex"),
        ]),
      ),
    },
    null,
    2,
  ).concat("\n");
  const contents = new Map(
    sourceFiles.map((relative) => [relative, fs.readFileSync(path.join(assets, relative))]),
  );
  contents.set(".agent-distro/manifest.json", Buffer.from(manifest));
  const unsafe = outputFiles.filter((relative) => hasSymlinkAncestor(destination, relative));
  if (unsafe.length) {
    return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", `Refusing symlinked managed paths: ${unsafe.join(", ")}`);
  }
  const directories = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    return fs.existsSync(output) && !fs.lstatSync(output).isFile();
  });
  if (directories.length) {
    return fail("AGENT_DISTRO_E_DESTINATION_UNSAFE", `Refusing non-file managed paths: ${directories.join(", ")}`);
  }
  const conflicts = outputFiles.filter((relative) => {
    const output = path.join(destination, relative);
    if (!fs.existsSync(output)) return false;
    return !contents.get(relative).equals(fs.readFileSync(output));
  });

  if (conflicts.length && !force) {
    return fail("AGENT_DISTRO_E_CONFLICT", `Refusing to overwrite: ${conflicts.join(", ")}`);
  }

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
    fs.writeFileSync(recoveryPath(destination), JSON.stringify({
      version: 1,
      staging: path.basename(staging),
      files: replacements.map(({ relative, backup }) => ({ relative, hadPrevious: Boolean(backup) })),
    }));
    for (const replacement of replacements) {
      const { relative, output } = replacement;
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.renameSync(path.join(staging, relative), output);
      committed.push(replacement);
    }
  } catch (error) {
    for (const { output, backup } of committed.reverse()) {
      if (backup && fs.existsSync(backup)) {
        fs.rmSync(output, { force: true });
        fs.renameSync(backup, output);
      } else {
        fs.rmSync(output, { force: true });
      }
    }
    fs.rmSync(recoveryPath(destination), { force: true });
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    return fail("AGENT_DISTRO_E_UNEXPECTED", error instanceof Error ? error.message : String(error));
  }
  fs.rmSync(recoveryPath(destination), { force: true });
  fs.rmSync(staging, { recursive: true, force: true });
  return 0;
}

async function interactiveInstall(target?: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return fail("AGENT_DISTRO_E_USAGE", "Interactive install requires a terminal; use --asset <path...> or --all.");
  }
  const p = await import("@clack/prompts");
  p.intro("Agent Distro install");
  const destination = target ?? await p.text({ message: "Install into", initialValue: process.cwd(), validate: (value) => value ? undefined : "A target directory is required." });
  if (p.isCancel(destination)) {
    p.cancel("Installation cancelled.");
    return 0;
  }
  const selected = await p.multiselect({
    message: "Select assets to install",
    options: assetChoices.map(([value, label]) => ({ value, label, hint: value })),
    required: false,
  });
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

export async function run(args: string[]) {
  let exitCode = 0;
  const program = new Command()
    .name("agent-distro")
    .description("Install and verify Agent Distro assets")
    .version(version)
    .showHelpAfterError()
    .exitOverride();

  program.command("verify <target>").description("Verify installed Agent Distro assets").action((target) => {
    exitCode = verify(target);
  });
  program.command("recover <target>").description("Restore an interrupted Agent Distro installation").action((target) => {
    exitCode = recover(target);
  });
  program.command("diagnostics <target>").description("Print a safe read-only diagnostics snapshot").action((target) => {
    exitCode = diagnostics(target);
  });
  program.command("report-issue")
    .description("Print a pre-filled GitHub issue URL without submitting it")
    .option("--diagnostics-consent", "confirm that the sanitized summary may be included")
    .requiredOption("--message <summary>", "sanitized failure summary")
    .option("--action <name>", "command that failed")
    .option("--code <code>", "Agent Distro failure code")
    .action((options) => {
      exitCode = reportIssue(options);
    });
  program.command("install [target]")
    .description("Interactively select Agent Distro assets, or use --asset/--all for scripts")
    .option("--force", "replace changed Agent Distro assets")
    .option("--dry-run", "show changes without writing")
    .option("--asset <path...>", "asset path to install; repeatable")
    .option("--all", "install every Agent Distro asset")
    .option("--interactive", "open the selection wizard")
    .action(async (target, options) => {
      if (options.interactive || (!options.asset && !options.all)) {
        exitCode = await interactiveInstall(target);
        return;
      }
      if (!target) {
        exitCode = fail("AGENT_DISTRO_E_USAGE", "A target directory is required with --asset or --all.");
        return;
      }
      if (options.asset && options.all) {
        exitCode = fail("AGENT_DISTRO_E_USAGE", "Use either --asset or --all, not both.");
        return;
      }
      try {
        exitCode = install(target, { ...options, selected: options.all ? assetChoices.map(([value]) => value) : options.asset });
      } catch (error) {
        exitCode = fail("AGENT_DISTRO_E_USAGE", error instanceof Error ? error.message : String(error));
      }
    });

  if (args.length === 0) {
    program.outputHelp();
    return 1;
  }
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return 0;
      console.error(formatFailure("AGENT_DISTRO_E_USAGE", error.message));
      return error.exitCode;
    }
    throw error;
  }
  return exitCode;
}
