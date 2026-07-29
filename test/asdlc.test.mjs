import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createIssueUrl, formatFailure, install } from "../dist/cli.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "asdlc.mjs");
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
const target = () => fs.mkdtempSync(path.join(os.tmpdir(), "asdlc-test-"));

describe("asdlc install", () => {
  it("prints standard help and its package version", () => {
    expect(command("--help")).toContain("Usage: asdlc");
    expect(command("install", "--help")).toContain("--dry-run");
    expect(command("--version")).toBe("0.0.0\n");
  });

  it("rejects options that do not belong to a command", () => {
    expect(failed("verify", target(), "--force")).toContain("ASDLC_E_USAGE");
  });

  it("prints stable codes and recovery actions for expected failures", () => {
    const fileTarget = path.join(os.tmpdir(), `asdlc-file-${process.pid}-${Date.now()}`);
    fs.writeFileSync(fileTarget, "not a directory\n");
    expect(failed("install", fileTarget, "--all")).toMatch(/ASDLC_E_TARGET_INVALID:[\s\S]*Next:/);

    const destination = target();
    run(destination);
    fs.writeFileSync(path.join(destination, ".mcp.json"), "changed\n");
    expect(failed("install", destination, "--all")).toMatch(/ASDLC_E_CONFLICT:[\s\S]*Next:/);

    const manifestPath = path.join(destination, ".asdlc", "manifest.json");
    fs.writeFileSync(manifestPath, "not json\n");
    expect(failed("verify", destination)).toMatch(/ASDLC_E_MANIFEST_INVALID:[\s\S]*Next:/);
  });

  it("redacts unexpected errors and prints a recovery action", () => {
    const output = formatFailure("ASDLC_E_UNEXPECTED", "token=ghp_ABCdef123 /Users/example/project");
    expect(output).toContain("ASDLC_E_UNEXPECTED");
    expect(output).toContain("Next:");
    expect(output).toContain("[redacted]");
    expect(output).toContain("[local-path]");
    expect(output).not.toContain("ghp_ABCdef123");
    expect(output).toContain("asdlc report-issue --diagnostics-consent");
    expect(output).not.toContain("/Users/example/project");
  });

  it("creates a local, redacted issue URL only with explicit consent", () => {
    const direct = new URL(createIssueUrl({
      message: "token=ghp_ABCdef123 C:\\Users\\example\\project /Users/example/project",
      action: "install",
      code: "ASDLC_E_UNEXPECTED",
    }));
    const body = direct.searchParams.get("body");
    expect(direct.origin + direct.pathname).toBe("https://github.com/mortenbroesby/agent-distro/issues/new");
    expect(body).toContain("Review before submitting");
    expect(body).toContain("[redacted]");
    expect(body).toContain("[local-path]");
    expect(body).not.toContain("ghp_ABCdef123");
    expect(body).not.toContain("C:\\Users\\example");

    expect(failed("report-issue", "--message", "failure")).toContain("ASDLC_E_USAGE");
    const reported = new URL(command("report-issue", "--diagnostics-consent", "--message", "failure", "--action", "install", "--code", "ASDLC_E_UNEXPECTED").trim());
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
    expect(fs.existsSync(path.join(destination, ".github/agents/asdlc.agent.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/hooks/asdlc.json"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/instructions/asdlc.instructions.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/prompts/asdlc.prompt.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/skills/asdlc/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".mcp.json"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(destination, ".asdlc/manifest.json"), "utf8")).files).toHaveLength(6);
  });

  it("installs only explicitly selected assets outside the wizard", () => {
    const destination = target();
    command("install", destination, "--asset", ".mcp.json", ".github/prompts/asdlc.prompt.md");
    expect(fs.existsSync(path.join(destination, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/prompts/asdlc.prompt.md"))).toBe(true);
    expect(fs.existsSync(path.join(destination, ".github/agents/asdlc.agent.md"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(destination, ".asdlc/manifest.json"), "utf8")).files).toEqual([
      ".mcp.json",
      ".github/prompts/asdlc.prompt.md",
    ]);
    expect(failed("install", destination, "--asset", "unknown")).toContain("ASDLC_E_USAGE");
  });

  it("does not overwrite a changed target without --force", () => {
    const destination = target();
    run(destination);
    fs.writeFileSync(path.join(destination, ".mcp.json"), "changed\n");
    expect(() => run(destination)).toThrow();
    run(destination, "--force");
    expect(JSON.parse(fs.readFileSync(path.join(destination, ".mcp.json"), "utf8"))).toEqual({ mcpServers: {} });
  });

  it("does not partially install when any target file conflicts", () => {
    const destination = target();
    fs.writeFileSync(path.join(destination, ".mcp.json"), "changed\n");
    expect(() => run(destination)).toThrow();
    expect(fs.existsSync(path.join(destination, ".github/agents/asdlc.agent.md"))).toBe(false);
  });

  it("keeps the previous installation when staging a new install fails", () => {
    const destination = target();
    expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    const originalWrite = fs.writeFileSync;
    fs.writeFileSync = (file, ...args) => {
      if (String(file).includes(".asdlc-stage-")) throw new Error("simulated staged write failure");
      return originalWrite(file, ...args);
    };
    try {
      expect(install(destination, { selected: [".mcp.json", ".github/prompts/asdlc.prompt.md"] })).toBe(1);
    } finally {
      fs.writeFileSync = originalWrite;
    }
    expect(verify(destination)).toContain("Verified 1 assets");
    expect(fs.readdirSync(path.join(destination, ".asdlc"))).toEqual(["manifest.json"]);
  });

  it("rolls back completed renames when a later rename fails", () => {
    const destination = target();
    expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    const originalRename = fs.renameSync;
    let replacements = 0;
    fs.renameSync = (source, output) => {
      if (String(source).includes(".asdlc-stage-") && !String(source).includes(".backup") && ++replacements === 2) {
        throw new Error("simulated rename failure");
      }
      return originalRename(source, output);
    };
    try {
      expect(install(destination, { force: true, selected: [".mcp.json", ".github/prompts/asdlc.prompt.md"] })).toBe(1);
    } finally {
      fs.renameSync = originalRename;
    }
    expect(verify(destination)).toContain("Verified 1 assets");
    expect(fs.existsSync(path.join(destination, ".github/prompts/asdlc.prompt.md"))).toBe(false);
    expect(fs.readdirSync(path.join(destination, ".asdlc"))).toEqual(["manifest.json"]);
  });

  it("recovers a retained interrupted transaction before allowing another install", () => {
    const destination = target();
    expect(install(destination, { selected: [".mcp.json"] })).toBe(0);
    const control = path.join(destination, ".asdlc");
    const staging = fs.mkdtempSync(path.join(control, ".asdlc-stage-"));
    const manifest = path.join(control, "manifest.json");
    const backup = path.join(staging, ".backup", ".asdlc", "manifest.json");
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(manifest, backup);
    fs.writeFileSync(manifest, "interrupted\n");
    const prompt = path.join(destination, ".github/prompts/asdlc.prompt.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "interrupted\n");
    fs.writeFileSync(path.join(control, ".asdlc-recovery.json"), JSON.stringify({
      version: 1,
      staging: path.basename(staging),
      files: [
        { relative: ".github/prompts/asdlc.prompt.md", hadPrevious: false },
        { relative: ".asdlc/manifest.json", hadPrevious: true },
      ],
    }));
    expect(failed("install", destination, "--all")).toContain("ASDLC_E_RECOVERY_REQUIRED");
    expect(command("diagnostics", destination)).not.toContain("interrupted");
    expect(command("recover", destination)).toContain("Recovered the previous ASDLC installation");
    expect(verify(destination)).toContain("Verified 1 assets");
    expect(fs.existsSync(prompt)).toBe(false);
    expect(fs.existsSync(path.join(control, ".asdlc-recovery.json"))).toBe(false);
  });

  it("plans without creating the target", () => {
    const destination = path.join(os.tmpdir(), `asdlc-dry-run-${process.pid}-${Date.now()}`);
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
    fs.writeFileSync(path.join(destination, ".github/instructions/asdlc.instructions.md"), "changed\n");
    expect(() => verify(destination)).toThrow();
  });

  it("rejects Windows-style traversal in an untrusted manifest", () => {
    const destination = target();
    run(destination);
    const manifestPath = path.join(destination, ".asdlc/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.files = [path.win32.join("..", "outside.txt")];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => verify(destination)).toThrow();
  });

  it("rejects a target that is not a directory", () => {
    const destination = path.join(os.tmpdir(), `asdlc-file-${process.pid}-${Date.now()}`);
    fs.writeFileSync(destination, "not a directory\n");
    expect(() => run(destination)).toThrow();
  });

  it("refuses a directory where ASDLC needs to write a file", () => {
    const destination = target();
    fs.mkdirSync(path.join(destination, ".mcp.json"));
    expect(() => run(destination, "--force")).toThrow();
    expect(fs.existsSync(path.join(destination, ".github/agents/asdlc.agent.md"))).toBe(false);
  });
});
