import fs from "node:fs";
import path from "node:path";

export function hasSymlinkAncestor(root: string, relative: string) {
  let current = root;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

export function manifestParts(relative: unknown) {
  if (typeof relative !== "string" || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) throw new Error("unsafe manifest path: " + relative);
  const parts = relative.split(/[\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw new Error("unsafe manifest path: " + relative);
  return parts;
}
