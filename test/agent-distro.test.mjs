// CLI and installer regression suite: exercises the public binary plus failure,
// transaction, recovery, and interactive seams without a real terminal.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createIssueUrl, formatFailure, install, runInteractiveInstall } from "../dist/agent-distro.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "agent-distro.mjs");
const command = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: "pipe" });
const failed = (...args) => {
  try {
    command(...args);
  } catch (error) {
    return error.stderr;
  }
  throw new Error("Expected command to fail");
};
const run = (target, ...options) =>
  command("install", target, "--all", ...options);
const verify = (target) => command("verify", target);
const target = () => fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-test-"));

describe("agent-distro install", () => {
  it("prints standard help and its package version", () => {
    expect(command("--help")).toContain("Usage: agent-distro");
    expect(command("install", "--help")).toContain("--dry-run");
    expect(command("install", "--help")).toContain("Install into any directory");
    expect(command("--version")).toBe("0.0.0\n");
  });

  it("rejects options that do not belong to a command", () => {
    expect(failed("verify", target(), "--force")).toContain("AGENT_DISTRO_E_USAGE");
  });

  it("does not start the interactive wizard without a terminal", () => {
    const destination = path.join(os.tmpdir(), `agent-distro-no-tty-${process.pid}-${Date.now()}`);
    expect(failed("install", destination)).toContain("Interactive install requires a terminal");
    expect(fs.existsSync(destination)).toBe(false);
  });

  it("runs the TUI through target, selection, confirmation, and progress", async () => {
    const destination = target();
    const calls = [];
    const prompts = {
      intro: (message) => calls.push(["intro", message]),
      text: async () => destination,
      multiselect: async () => [".mcp.json"],
      confirm: async () => true,
      isCancel: () => false,
      cancel: (message) => calls.push(["cancel", message]),
      spinner: () => ({ start: (message) => calls.push(["start", message]), stop: (message) => calls.push(["stop", message]) }),
      outro: (message) => calls.push(["outro", message]),
    };
    expect(await runInteractiveInstall(undefined, prompts)).toBe(0);
    expect(fs.existsSync(path.join(destination, ".mcp.json"))).toBe(true);
    expect(calls).toEqual(expect.arrayContaining([
      ["intro", "Agent Distro install"],
      ["start", "Installing selected assets"],
      ["stop", "Assets synchronized."],
      ["outro", "Installation complete."],
    ]));
  });

  it("cancels the TUI before writing", async () => {
    const destination = target();
    const prompts = {
      intro: () => {},
      text: async () => destination,
      multiselect: async () => [".mcp.json"],
      confirm: async () => false,
      isCancel: () => false,
      cancel: () => {},
      spinner: () => ({ start: () => {}, stop: () => {} }),
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
    expect(failed("verify", destination)).toMatch(/AGENT_DISTRO_E_MANIFEST_INVALID:[\s\S]*Next:/);
  });

  it("redacts unexpected errors and prints a recovery action", () => {
    const output = formatFailure("AGENT_DISTRO_E_UNEXPECTED", "token=ghp_ABCdef123 /Users/example/project");
    expect(output).toContain("AGENT_DISTRO_E_UNEXPECTED");
    expect(output).toContain("Next:");
    expect(output).toContain("[redacted]");
    expect(output).toContain("[local-path]");
    expect(output).not.toContain("ghp_ABCdef123");
    expect(output).toContain("agent-distro report-issue --diagnostics-consent");
    expect(output).not.toContain("/Users/example/project");
  });

  it("creates a local, redacted issue URL only with explicit consent", () => {
    const direct = new URL(createIssueUrl({
      message: "token=ghp_ABCdef123 C:\\Users\\example\\project /Users/example/project",
      action: "install",
      code: "AGENT_DISTRO_E_UNEXPECTED",
    }));
    const body = direct.searchParams.get("body");
    expect(direct.origin + direct.pathname).toBe("https://github.com/mortenbroesby/agent-distro/issues/new");
    expect(body).toContain("Review before submitting");
    expect(body).toContain("[redacted]");
    expect(body).toContain("[local-path]");
    expect(body).not.toContain("ghp_ABCdef123");
    expect(body).not.toContain("C:\\Users\\example");

    expect(failed("report-issue", "--message", "failure")).toContain("AGENT_DISTRO_E_USAGE");
    const reported = new URL(command("report-issue", "--diagnostics-consent", "--message", "failure", "--action", "install", "--code", "AGENT_DISTRO_E_UNEXPECTED").trim());
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

  it("installs every Copilot asset category and records ownership", () => {
    const destination = target();
    run(destination);
    expect(fs.existsSync(path.join(destination, ".github/agents/agent-distro.agent.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/hooks/agent-distro.json"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/instructions/agent-distro.instructions.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/prompts/agent-distro.prompt.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/skills/agent-distro/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".mcp.json"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(destination, ".agent-distro/manifest.json"), "utf8")).files).toHaveLength(6);
  });

  it("installs only explicitly selected assets outside the wizard", () => {
    const destination = target();
    command("install", destination, "--asset", ".mcp.json", ".github/prompts/agent-distro.prompt.md");
    expect(fs.existsSync(path.join(destination, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/prompts/agent-distro.prompt.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/agents/agent-distro.agent.md"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(destination, ".agent-distro/manifest.json"), "utf8")).files).toEqual([
      ".mcp.json",
      ".github/prompts/agent-distro.prompt.md",
    ]);
    expect(failed("install", destination, "--asset", "unknown")).toContain("AGENT_DISTRO_E_USAGE");
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
    expect(fs.existsSync(path.join(destination, ".github/agents/agent-distro.agent.md"))).toBe(false);
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
      expect(install(destination, { selected: [".mcp.json", ".github/prompts/agent-distro.prompt.md"] })).toBe(1);
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
    expect(install(destination, { selected: [".github/prompts/agent-distro.prompt.md"] })).toBe(1);
    expect(fs.existsSync(path.join(outside, "prompts/agent-distro.prompt.md"))).toBe(false);
  });

  it("rolls back completed renames when a later rename fails", () => {
    const destination = target();
    expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    const originalRename = fs.renameSync;
    let replacements = 0;
    fs.renameSync = (source, output) => {
      if (String(source).includes(".agent-distro-stage-") && !String(source).includes(".backup") && ++replacements === 2) {
        throw new Error("simulated rename failure");
      }
      return originalRename(source, output);
    };
    try {
      expect(install(destination, { force: true, selected: [".mcp.json", ".github/prompts/agent-distro.prompt.md"] })).toBe(1);
    } finally {
      fs.renameSync = originalRename;
    }
    expect(verify(destination)).toContain("Verified 1 assets");
    expect(fs.existsSync(path.join(destination, ".github/prompts/agent-distro.prompt.md"))).toBe(false);
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
    const prompt = path.join(destination, ".github/prompts/agent-distro.prompt.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "interrupted\n");
    fs.writeFileSync(path.join(control, ".agent-distro-recovery.json"), JSON.stringify({
      version: 1,
      staging: path.basename(staging),
      files: [
        { relative: ".github/prompts/agent-distro.prompt.md", hadPrevious: false },
        { relative: ".agent-distro/manifest.json", hadPrevious: true },
      ],
    }));
    expect(failed("install", destination, "--all")).toContain("AGENT_DISTRO_E_RECOVERY_REQUIRED");
    expect(command("diagnostics", destination)).not.toContain("interrupted");
    expect(command("recover", destination)).toContain("Recovered the previous Agent Distro installation");
    expect(verify(destination)).toContain("Verified 1 assets");
    expect(fs.existsSync(prompt)).toBe(false);
    expect(fs.existsSync(path.join(control, ".agent-distro-recovery.json"))).toBe(false);
  });

  it("plans without creating the target", () => {
    const destination = path.join(os.tmpdir(), `agent-distro-dry-run-${process.pid}-${Date.now()}`);
    expect(fs.existsSync(destination)).toBe(false);
    expect(run(destination, "--dry-run")).toContain("Would sync 7 changed assets");
    expect(fs.existsSync(destination)).toBe(false);
  });

  it("prints read-only diagnostics without target paths or asset contents", () => {
    const destination = target();
    run(destination);
    const result = JSON.parse(command("diagnostics", destination));
    expect(result).toMatchObject({
      version: "0.0.0",
      target: { exists: true, directory: true },
      manifest: { present: true, valid: true, assetCount: 6 },
    });
    expect(JSON.stringify(result)).not.toContain(destination);
  });

  it("verifies recorded assets and detects drift", () => {
    const destination = target();
    run(destination);
    expect(verify(destination)).toContain("Verified 6 assets");
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
    expect(fs.existsSync(path.join(destination, ".github/agents/agent-distro.agent.md"))).toBe(false);
  });
});
