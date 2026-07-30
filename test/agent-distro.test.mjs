// CLI and installer regression suite: exercises the public binary plus failure,
// transaction, recovery, and interactive seams without a real terminal.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createIssueUrl, formatFailure, install, runInteractiveInstall } from "../dist/agent-distro.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "agent-distro.mjs");
const bootstrap = path.join(root, "scripts", "bootstrap.mjs");
const command = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: "pipe" });
const commandResult = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result;
};
const commandFrom = (cwd, ...args) =>
  execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", stdio: "pipe" });
const failed = (...args) => {
  try {
    command(...args);
  } catch (error) {
    return error.stderr;
  }
  throw new Error("Expected command to fail");
};
const failedBootstrap = (...args) => {
  try {
    execFileSync(process.execPath, [bootstrap, ...args], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    return error.stderr;
  }
  throw new Error("Expected bootstrap to fail");
};
const run = (target, ...options) => command("install", target, "--all", ...options);
const verify = (target) => command("doctor", target);
const target = () => fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-test-"));

describe("agent-distro install", () => {
  it("prints standard help and its package version", () => {
    expect(command("--help")).toContain("Usage: agent-distro");
    expect(command("install", "--help")).toContain("--dry-run");
    expect(command("install", "--help")).toContain("Install into any directory");
    expect(command("--version")).toBe("0.0.0\n");
  });

  it("lists commands in the established help order", () => {
    const commands = command("--help")
      .split("\n")
      .flatMap((line) => line.match(/^  ([a-z-]+)(?:\s|$)/)?.[1] ?? []);
    expect(commands).toEqual(["doctor", "recover", "report-issue", "profiles", "install", "update", "help"]);
  });

  it("rejects an incomplete bootstrap doctor option", () => {
    expect(failedBootstrap("--doctor")).toContain(
      "Usage: bin/agent-distro bootstrap [--home <directory>] [--doctor [target]]",
    );
  });

  it("groups verification and diagnostics under doctor", () => {
    const destination = target();
    run(destination);
    expect(command("doctor", destination)).toMatch(/Global CLI:.*\nVerified/);
    expect(JSON.parse(command("doctor", "--diagnostics", destination))).toMatchObject({
      target: { exists: true, directory: true },
    });
    expect(JSON.parse(command("doctor", "--json", destination))).toMatchObject({
      global: { managedCheckout: expect.any(Boolean) },
      manifest: { valid: true },
    });
    expect(commandFrom(destination, "doctor")).toContain("Verified");
    expect(failed("verify", destination)).toContain("unknown command 'verify'");
    expect(failed("diagnostics", destination)).toContain("unknown command 'diagnostics'");
  });

  it("treats an unmanaged directory as an informational doctor result", () => {
    expect(command("doctor", target())).toContain("No Agent Distro installation found");
  });

  it("rejects options that do not belong to a command", () => {
    expect(failed("doctor", target(), "--force")).toContain("AGENT_DISTRO_E_USAGE");
  });

  it("does not start the interactive wizard without a terminal", () => {
    const destination = path.join(os.tmpdir(), `agent-distro-no-tty-${process.pid}-${Date.now()}`);
    expect(failed("install", destination)).toContain("Interactive install requires a terminal");
    expect(fs.existsSync(destination)).toBe(false);
  });

  it("reports concise installation phases only when verbose output is requested", () => {
    const result = commandResult("install", target(), "--asset", ".mcp.json", "--verbose");
    expect(result.stdout).toContain("Synced 2 changed assets");
    expect(result.stderr).toContain("[agent-distro] Validated destination;");
    expect(result.stderr).toContain("[agent-distro] Staging changes safely.");
    expect(result.stderr).toContain("[agent-distro] Applying staged changes.");
    expect(result.stderr).toContain("[agent-distro] Finalized installation.");
  });

  it("runs the TUI through target, selection, confirmation, and progress", async () => {
    const destination = target();
    const calls = [];
    const prompts = {
      intro: (message) => calls.push(["intro", message]),
      text: async () => destination,
      multiselect: async () => {
        const count = calls.filter(([name]) => name === "multiselect").length;
        calls.push(["multiselect", count]);
        return count === 0 ? ["common"] : count === 1 ? [] : [".mcp.json"];
      },
      confirm: async () => true,
      isCancel: () => false,
      cancel: (message) => calls.push(["cancel", message]),
      taskLog: ({ title }) => ({
        message: (message) => calls.push(["log", message]),
        success: (message) => calls.push(["success", message]),
        error: (message) => calls.push(["error", message]),
        title,
      }),
      outro: (message) => calls.push(["outro", message]),
    };
    expect(await runInteractiveInstall(undefined, prompts)).toBe(0);
    expect(fs.existsSync(path.join(destination, ".mcp.json"))).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["intro", "Agent Distro install"],
        ["log", "Staging changes safely."],
        ["log", "Applying staged changes."],
        ["log", "Finalized installation."],
        ["success", "Assets synchronized."],
        ["outro", "Installation complete."],
      ]),
    );
  });

  it("cancels the TUI before writing", async () => {
    const destination = target();
    const prompts = {
      intro: () => {},
      text: async () => destination,
      multiselect: async () => [],
      confirm: async () => false,
      isCancel: () => false,
      cancel: () => {},
      taskLog: () => ({ message: () => {}, success: () => {}, error: () => {} }),
      outro: () => {},
    };
    expect(await runInteractiveInstall(undefined, prompts)).toBe(0);
    expect(fs.existsSync(path.join(destination, ".mcp.json"))).toBe(false);
  });

  it("prints stable codes and recovery actions for expected failures", () => {
    const fileTarget = path.join(os.tmpdir(), `agent-distro-file-${process.pid}-${Date.now()}`);
    fs.writeFileSync(fileTarget, "not a directory\n");
    expect(failed("install", fileTarget, "--all")).toMatch(/AGENT_DISTRO_E_TARGET_INVALID:[\s\S]*Next:/);

    const destination = target();
    run(destination);
    fs.writeFileSync(path.join(destination, ".mcp.json"), "changed\n");
    expect(failed("install", destination, "--all")).toMatch(/AGENT_DISTRO_E_CONFLICT:[\s\S]*Next:/);

    const manifestPath = path.join(destination, ".agent-distro", "manifest.json");
    fs.writeFileSync(manifestPath, "not json\n");
    expect(failed("doctor", destination)).toMatch(/AGENT_DISTRO_E_MANIFEST_INVALID:[\s\S]*run doctor again/);
  });

  it("redacts unexpected errors and prints a recovery action", () => {
    const output = formatFailure("AGENT_DISTRO_E_UNEXPECTED", "token=ghp_ABCdef123 /Users/example/project");
    expect(output).toContain("AGENT_DISTRO_E_UNEXPECTED");
    expect(output).toContain("Next:");
    expect(output).toContain("[redacted]");
    expect(output).toContain("[local-path]");
    expect(output).not.toContain("ghp_ABCdef123");
    expect(output).toContain("agent-distro doctor --diagnostics <target>");
    expect(output).toContain("agent-distro report-issue --diagnostics-consent");
    expect(output).not.toContain("/Users/example/project");
  });

  it("creates a local, redacted issue URL only with explicit consent", () => {
    const direct = new URL(
      createIssueUrl({
        message: "token=ghp_ABCdef123 C:\\Users\\example\\project /Users/example/project",
        action: "install",
        code: "AGENT_DISTRO_E_UNEXPECTED",
      }),
    );
    const body = direct.searchParams.get("body");
    expect(direct.origin + direct.pathname).toBe("https://github.com/mortenbroesby/agent-distro/issues/new");
    expect(body).toContain("Review before submitting");
    expect(body).toContain("[redacted]");
    expect(body).toContain("[local-path]");
    expect(body).not.toContain("ghp_ABCdef123");
    expect(body).not.toContain("C:\\Users\\example");

    expect(failed("report-issue", "--message", "failure")).toContain("AGENT_DISTRO_E_USAGE");
    const reported = new URL(
      command(
        "report-issue",
        "--diagnostics-consent",
        "--message",
        "failure",
        "--action",
        "install",
        "--code",
        "AGENT_DISTRO_E_UNEXPECTED",
      ).trim(),
    );
    expect(reported.searchParams.get("body")).toContain("Failure: failure");
  });

  it("does not write files while reporting an issue", () => {
    const directory = target();
    const before = fs.readdirSync(directory);
    const output = execFileSync(
      process.execPath,
      [cli, "report-issue", "--diagnostics-consent", "--message", "failure"],
      { cwd: directory, encoding: "utf8", stdio: "pipe" },
    );
    expect(new URL(output.trim()).pathname).toBe("/mortenbroesby/agent-distro/issues/new");
    expect(fs.readdirSync(directory)).toEqual(before);
  });

  it("installs only explicitly selected assets outside the wizard", () => {
    const destination = target();
    command("install", destination, "--asset", ".mcp.json", ".github/prompts/debugging.prompt.md");
    expect(fs.existsSync(path.join(destination, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/prompts/debugging.prompt.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/agents/debugging.agent.md"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(destination, ".agent-distro/manifest.json"), "utf8")).files).toEqual([
      ".mcp.json",
      ".github/prompts/debugging.prompt.md",
    ]);
    expect(failed("install", destination, "--asset", "unknown")).toContain("AGENT_DISTRO_E_USAGE");
  });

  it("installs a profile, composes it with individual assets, and lists the catalog", () => {
    const destination = target();
    expect(JSON.parse(command("profiles"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "debugging", stack: "common" })]),
    );
    command("install", destination, "--profile", "debugging", "--asset", ".mcp.json");
    const manifest = JSON.parse(fs.readFileSync(path.join(destination, ".agent-distro/manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ catalogVersion: expect.stringMatching(/^sha256-/) });
    expect(manifest).toMatchObject({ version: 2, selection: { stacks: ["common"], profiles: ["debugging"] } });
    expect(manifest.files).toEqual([
      ".mcp.json",
      ".github/agents/debugging.agent.md",
      ".github/skills/debugging/SKILL.md",
      ".github/prompts/debugging.prompt.md",
    ]);
    expect(failed("install", destination, "--profile", "unknown")).toContain("AGENT_DISTRO_E_USAGE");
  });

  it("updates an existing selection and rejects an unmanaged target", () => {
    const destination = target();
    command("install", destination, "--profile", "debugging");
    expect(command("update", destination, "--profile", "debugging")).toContain("Synced 0 changed assets");
    expect(failed("update", target(), "--profile", "debugging")).toContain("run install first");
  });

  it("refuses deselection until it can archive displaced assets", () => {
    const destination = target();
    run(destination);
    expect(failed("update", destination, "--asset", ".mcp.json")).toContain("AGENT_DISTRO_E_ARCHIVE_REQUIRED");
  });

  it("does not overwrite a changed target without --force", () => {
    const destination = target();
    run(destination);
    fs.writeFileSync(path.join(destination, ".mcp.json"), "changed\n");
    expect(() => run(destination)).toThrow();
    run(destination, "--force");
    expect(JSON.parse(fs.readFileSync(path.join(destination, ".mcp.json"), "utf8"))).toEqual({ mcpServers: {} });
  });

  it("does not create transactional state for an unchanged install", () => {
    const destination = target();
    expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    const originalMkdtemp = fs.mkdtempSync;
    const originalWrite = fs.writeFileSync;
    fs.mkdtempSync = () => {
      throw new Error("unchanged install created staging");
    };
    fs.writeFileSync = () => {
      throw new Error("unchanged install wrote a file");
    };
    try {
      expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    } finally {
      fs.mkdtempSync = originalMkdtemp;
      fs.writeFileSync = originalWrite;
    }
    expect(fs.readdirSync(path.join(destination, ".agent-distro"))).toEqual(["manifest.json"]);
  });

  it("does not partially install when any target file conflicts", () => {
    const destination = target();
    fs.writeFileSync(path.join(destination, ".mcp.json"), "changed\n");
    expect(() => run(destination)).toThrow();
    expect(fs.existsSync(path.join(destination, ".github/agents/pull-request-review.agent.md"))).toBe(false);
  });

  it("keeps the previous installation when staging a new install fails", () => {
    const destination = target();
    expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    const originalWrite = fs.writeFileSync;
    fs.writeFileSync = (file, ...args) => {
      if (String(file).includes(".agent-distro-stage-")) {
        throw Object.assign(new Error("simulated EACCES staged write failure"), { code: "EACCES" });
      }
      return originalWrite(file, ...args);
    };
    try {
      expect(install(destination, { selected: [".mcp.json", ".github/prompts/debugging.prompt.md"] })).toBe(1);
    } finally {
      fs.writeFileSync = originalWrite;
    }
    expect(verify(destination)).toContain("Verified 1 assets");
    expect(fs.readdirSync(path.join(destination, ".agent-distro"))).toEqual(["manifest.json"]);
  });

  it("refuses a symlinked managed asset path without writing through it", () => {
    const destination = target();
    const outside = target();
    fs.symlinkSync(outside, path.join(destination, ".github"), process.platform === "win32" ? "junction" : "dir");
    expect(install(destination, { selected: [".github/prompts/debugging.prompt.md"] })).toBe(1);
    expect(fs.existsSync(path.join(outside, "prompts/debugging.prompt.md"))).toBe(false);
  });

  it("rolls back completed renames when a later rename fails", () => {
    const destination = target();
    const phases = [];
    expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    const originalRename = fs.renameSync;
    let replacements = 0;
    fs.renameSync = (source, output) => {
      if (
        String(source).includes(".agent-distro-stage-") &&
        !String(source).includes(".backup") &&
        ++replacements === 2
      ) {
        throw new Error("simulated rename failure");
      }
      return originalRename(source, output);
    };
    try {
      expect(
        install(destination, {
          force: true,
          selected: [".mcp.json", ".github/prompts/debugging.prompt.md"],
          onStep: (message) => phases.push(message),
        }),
      ).toBe(1);
    } finally {
      fs.renameSync = originalRename;
    }
    expect(verify(destination)).toContain("Verified 1 assets");
    expect(phases).toEqual(expect.arrayContaining(["Rolling back partial changes.", "Rollback complete."]));
    expect(fs.existsSync(path.join(destination, ".github/prompts/debugging.prompt.md"))).toBe(false);
    expect(fs.readdirSync(path.join(destination, ".agent-distro"))).toEqual(["manifest.json"]);
  });

  it("recovers a retained interrupted transaction before allowing another install", () => {
    const destination = target();
    expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    const control = path.join(destination, ".agent-distro");
    const staging = fs.mkdtempSync(path.join(control, ".agent-distro-stage-"));
    const manifest = path.join(control, "manifest.json");
    const backup = path.join(staging, ".backup", ".agent-distro", "manifest.json");
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(manifest, backup);
    fs.writeFileSync(manifest, "interrupted\n");
    const prompt = path.join(destination, ".github/prompts/debugging.prompt.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "interrupted\n");
    fs.writeFileSync(
      path.join(control, ".agent-distro-recovery.json"),
      JSON.stringify({
        version: 1,
        staging: path.basename(staging),
        files: [
          { relative: ".github/prompts/debugging.prompt.md", hadPrevious: false },
          { relative: ".agent-distro/manifest.json", hadPrevious: true },
        ],
      }),
    );
    expect(failed("install", destination, "--all")).toContain("AGENT_DISTRO_E_RECOVERY_REQUIRED");
    expect(command("doctor", "--diagnostics", destination)).not.toContain("interrupted");
    expect(command("recover", destination)).toContain("Recovered the previous Agent Distro installation");
    expect(verify(destination)).toContain("Verified 1 assets");
    expect(fs.existsSync(prompt)).toBe(false);
    expect(fs.existsSync(path.join(control, ".agent-distro-recovery.json"))).toBe(false);
  });

  it("plans without creating the target", () => {
    const destination = path.join(os.tmpdir(), `agent-distro-dry-run-${process.pid}-${Date.now()}`);
    expect(fs.existsSync(destination)).toBe(false);
    expect(run(destination, "--dry-run")).toMatch(/Would sync [1-9]\d* changed assets/);
    expect(fs.existsSync(destination)).toBe(false);
  });

  it("prints read-only diagnostics without target paths or asset contents", () => {
    const destination = target();
    run(destination);
    const result = JSON.parse(command("doctor", "--diagnostics", destination));
    expect(result).toMatchObject({
      version: "0.0.0",
      target: { exists: true, directory: true },
      manifest: { present: true, valid: true, assetCount: expect.any(Number) },
    });
    expect(JSON.stringify(result)).not.toContain(destination);
  });

  it("verifies recorded assets and detects drift", () => {
    const destination = target();
    run(destination);
    expect(verify(destination)).toMatch(/Verified [1-9]\d* assets/);
    fs.writeFileSync(path.join(destination, ".github/instructions/agent-distro.instructions.md"), "changed\n");
    expect(() => verify(destination)).toThrow();
  });

  it("rejects Windows-style traversal in an untrusted manifest", () => {
    const destination = target();
    run(destination);
    const manifestPath = path.join(destination, ".agent-distro/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.files = [path.win32.join("..", "outside.txt")];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => verify(destination)).toThrow();
  });

  it("rejects a target that is not a directory", () => {
    const destination = path.join(os.tmpdir(), `agent-distro-file-${process.pid}-${Date.now()}`);
    fs.writeFileSync(destination, "not a directory\n");
    expect(() => run(destination)).toThrow();
  });

  it("refuses a directory where Agent Distro needs to write a file", () => {
    const destination = target();
    fs.mkdirSync(path.join(destination, ".mcp.json"));
    expect(() => run(destination, "--force")).toThrow();
    expect(fs.existsSync(path.join(destination, ".github/agents/pull-request-review.agent.md"))).toBe(false);
  });
});
