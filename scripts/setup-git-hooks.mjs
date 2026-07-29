import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// npm also runs prepare for packed dependencies, where no Git checkout exists.
// Configure the tracked hooks only for a developer checkout.
if (existsSync(path.join(root, ".git"))) {
  const result = spawnSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
