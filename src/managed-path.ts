import fs from "node:fs";
import path from "node:path";

/**
 * Detects a symbolic-link ancestor without requiring the managed output itself
 * to exist.
 *
 * @param root - Explicit repository root selected by the caller.
 * @param relative - Native relative path below `root`.
 * @returns `true` when a write could escape through an existing symlink.
 * @remarks New leaf paths are allowed; only existing parent directories can
 * redirect a filesystem operation outside the selected repository.
 */
export function hasSymlinkAncestor(root: string, relative: string) {
  let current = root;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

/**
 * Converts a manifest path into safe platform-native segments.
 *
 * Both POSIX and Windows absolute paths are rejected so a manifest remains
 * portable and can never redirect installation outside its chosen target.
 *
 * @param relative - Untrusted path from a manifest or generated catalog.
 * @returns Native-safe path segments with no empty, dot, parent, or absolute part.
 * @throws {Error} When the value could refer outside its selected target root.
 */
export function manifestParts(relative: unknown) {
  if (typeof relative !== "string" || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative))
    throw new Error(`unsafe manifest path: ${relative}`);
  const parts = relative.split(/[\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === ".."))
    throw new Error(`unsafe manifest path: ${relative}`);
  return parts;
}
