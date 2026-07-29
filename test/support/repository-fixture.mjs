import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { test as baseTest } from "vitest";

async function gitRepository(directory) {
  await execa("git", ["init", "--quiet"], { cwd: directory });
  await execa("git", ["config", "user.name", "Agent Distro fixture"], { cwd: directory });
  await execa("git", ["config", "user.email", "fixture@example.invalid"], { cwd: directory });
}

export const test = baseTest.extend("repository", async ({}, { onCleanup }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-fixture-å "));
  onCleanup(() => fs.rmSync(root, { recursive: true, force: true }));

  const plain = (name = "plain directory") => {
    const target = path.join(root, name);
    fs.mkdirSync(target, { recursive: true });
    return target;
  };

  return {
    plain,
    async git(name = "git repository") {
      const target = plain(name);
      await gitRepository(target);
      return target;
    },
    async monorepo() {
      const rootTarget = plain("monorepo");
      await gitRepository(rootTarget);
      const packageTarget = path.join(rootTarget, "packages", "web app");
      fs.mkdirSync(packageTarget, { recursive: true });
      fs.writeFileSync(path.join(rootTarget, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
      fs.writeFileSync(path.join(packageTarget, "package.json"), JSON.stringify({ name: "web-app", private: true }));
      return { root: rootTarget, package: packageTarget };
    },
    conflict() {
      const target = plain("conflicting repository");
      fs.writeFileSync(path.join(target, ".mcp.json"), "user-owned\n");
      return target;
    },
  };
});
