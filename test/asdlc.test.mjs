import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "asdlc.mjs");
const run = (target, ...options) =>
  execFileSync(process.execPath, [cli, "install", target, ...options], {
    encoding: "utf8",
    stdio: "pipe",
  });
const verify = (target) => execFileSync(process.execPath, [cli, "verify", target], { encoding: "utf8", stdio: "pipe" });
const target = () => fs.mkdtempSync(path.join(os.tmpdir(), "asdlc-test-"));

describe("asdlc install", () => {
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

  it("plans without creating the target", () => {
    const destination = path.join(os.tmpdir(), `asdlc-dry-run-${process.pid}-${Date.now()}`);
    expect(fs.existsSync(destination)).toBe(false);
    expect(run(destination, "--dry-run")).toContain("Would sync 7 changed assets");
    expect(fs.existsSync(destination)).toBe(false);
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
