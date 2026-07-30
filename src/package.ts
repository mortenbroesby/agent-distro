import fs from "node:fs";
import { valid } from "semver";

/** Package version read and validated at runtime for CLI and diagnostics. */
const packageVersion = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const parsedVersion = valid(packageVersion);

if (!parsedVersion) throw new Error("Agent Distro package version must be valid SemVer.");

/** SemVer-validated version shared by the CLI and persisted manifests. */
export const version = parsedVersion;
