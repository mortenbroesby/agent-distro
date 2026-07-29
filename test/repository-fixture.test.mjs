// Focused installer contract tests using disposable real directories and Git
// repositories; see the shared fixture for why these are not in-memory mocks.
import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { install } from "../dist/agent-distro.mjs";
import { test } from "./support/repository-fixture.mjs";

test("installs into real plain and Git directories without target discovery", async ({ repository }) => {
  const plain = repository.plain();
  const git = await repository.git();

  expect(install(plain, { selected: [".mcp.json"] })).toBe(0);
  expect(install(git, { selected: [".mcp.json"] })).toBe(0);
  expect(fs.existsSync(path.join(plain, ".git"))).toBe(false);
  expect(fs.existsSync(path.join(git, ".git"))).toBe(true);
});

test("targets only the requested monorepo package", async ({ repository }) => {
  const monorepo = await repository.monorepo();

  expect(install(monorepo.package, { selected: [".mcp.json"] })).toBe(0);
  expect(fs.existsSync(path.join(monorepo.package, ".mcp.json"))).toBe(true);
  expect(fs.existsSync(path.join(monorepo.root, ".mcp.json"))).toBe(false);
});

test("keeps a conflicting file in a real target until force is explicit", ({ repository }) => {
  const target = repository.conflict();

  expect(install(target, { selected: [".mcp.json"] })).toBe(1);
  expect(fs.readFileSync(path.join(target, ".mcp.json"), "utf8")).toBe("user-owned\n");
  expect(install(target, { force: true, selected: [".mcp.json"] })).toBe(0);
});
