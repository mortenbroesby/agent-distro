/**
 * Resolves Agent Distro artifact packages as inert content, never as npm
 * dependencies. The caller owns the fresh staging directory and decides what
 * validated content, if any, reaches an installation transaction.
 */
import fs from "node:fs";
import path from "node:path";
import pacote from "pacote";
import { manifestParts } from "./managed-path.js";

const lifecycleScripts = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
  "prepack",
  "postpack",
  "prepublishOnly",
  "postpublish",
]);
const artifactTypes = new Set(["agent", "skill", "instruction", "hook", "mcp"]);

/**
 * Restricts the initial resolver to forms Pacote can consume without an extra
 * package-builder dependency. Git and directories need Arborist to create a
 * tarball; deferring them keeps the extraction boundary small and script-free.
 *
 * @param spec - Raw npm-compatible package specification.
 * @throws {Error} When the source needs the deferred package-builder path.
 */
function assertSupportedSpec(spec: string): void {
  if (/^(?:git\+|git:|github:|gitlab:|bitbucket:|git@)/.test(spec))
    throw new Error("artifact Git sources are not supported yet");
  if (path.isAbsolute(spec) || spec.startsWith("./") || spec.startsWith("../"))
    throw new Error("artifact local directories are not supported yet");
  if (spec.startsWith("file:") && !/\.(?:tgz|tar|tar\.gz)$/.test(spec))
    throw new Error("artifact local directories are not supported yet");
}

/** A validated file declaration from an artifact package manifest. */
export type ArtifactAsset = { path: string; type: "agent" | "skill" | "instruction" | "hook" | "mcp" };

/** The intentionally small, versioned manifest embedded in every artifact package. */
export type ArtifactManifest = { schemaVersion: 1; assets: ArtifactAsset[] };

/** Resolved package metadata that is safe to persist in future installation state. */
export type ResolvedArtifact = {
  package: { name: string; version: string; resolved?: string; integrity?: string };
  manifest: ArtifactManifest;
  root: string;
};

/** Optional Pacote configuration required to resolve an approved npm registry. */
export type ArtifactSourceOptions = { registry?: string };

/** Untrusted package metadata returned by Pacote before runtime validation. */
type PackageMetadata = {
  name?: unknown;
  version?: unknown;
  scripts?: unknown;
  _resolved?: unknown;
  _integrity?: unknown;
};

/**
 * Rejects lifecycle hooks before extraction, even though Pacote is separately
 * called with `ignoreScripts: true`. This keeps executable package behavior
 * outside Agent Distro's artifact contract rather than merely suppressing it.
 *
 * @param packageManifest - Package metadata returned by Pacote.
 * @returns The name, version, and provenance metadata accepted for extraction.
 * @throws {Error} When the package metadata is incomplete or declares a lifecycle hook.
 */
function validatePackageManifest(value: unknown) {
  const packageManifest = value as PackageMetadata | undefined;
  if (typeof packageManifest?.name !== "string" || typeof packageManifest?.version !== "string")
    throw new Error("artifact package has invalid metadata");
  const scripts = packageManifest.scripts;
  if (scripts && typeof scripts === "object" && Object.keys(scripts).some((script) => lifecycleScripts.has(script)))
    throw new Error("artifact package declares lifecycle scripts");
  return {
    name: packageManifest.name,
    version: packageManifest.version,
    ...(typeof packageManifest._resolved === "string" ? { resolved: packageManifest._resolved } : {}),
    ...(typeof packageManifest._integrity === "string" ? { integrity: packageManifest._integrity } : {}),
  };
}

/**
 * Reads and validates the Agent Distro manifest after Pacote has extracted it.
 *
 * @param root - Fresh extraction directory controlled by the caller.
 * @returns The validated artifact manifest.
 * @throws {Error} When the manifest is missing, malformed, unsafe, or names a missing file.
 */
function readArtifactManifest(root: string): ArtifactManifest {
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, "agent-distro.manifest.json"), "utf8"));
  } catch {
    throw new Error("artifact package is missing a valid agent-distro.manifest.json");
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    (manifest as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((manifest as { assets?: unknown }).assets)
  )
    throw new Error("artifact package has an invalid agent-distro.manifest.json");

  const paths = new Set<string>();
  const assets = (manifest as { assets: unknown[] }).assets.map((asset) => {
    if (!asset || typeof asset !== "object") throw new Error("artifact package has an invalid asset declaration");
    const { path: assetPath, type } = asset as { path?: unknown; type?: unknown };
    const safePath = manifestParts(assetPath).join("/");
    if (!artifactTypes.has(String(type)) || paths.has(safePath))
      throw new Error("artifact package has an invalid asset declaration");
    const source = path.join(root, ...manifestParts(safePath));
    if (!fs.existsSync(source) || !fs.lstatSync(source).isFile())
      throw new Error("artifact package references a missing asset");
    paths.add(safePath);
    return { path: safePath, type: type as ArtifactAsset["type"] };
  });
  return { schemaVersion: 1, assets };
}

/**
 * Rejects special filesystem entries in extracted content before another layer
 * can read it. Pacote protects archive traversal; this closes the remaining
 * symlink and device-file boundary for downstream renderers.
 *
 * @param directory - Directory within the fresh extraction root to inspect.
 * @throws {Error} When package content contains a symbolic link or special file.
 */
function assertOrdinaryFiles(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
      throw new Error("artifact package contains an unsupported filesystem entry");
    if (entry.isDirectory()) assertOrdinaryFiles(current);
  }
}

/**
 * Resolves and extracts one npm-compatible artifact package into fresh staging.
 *
 * Registry packages, tags, and tarball specs are accepted through Pacote with
 * lifecycle scripts disabled. Git and local directories are deferred because
 * Pacote needs an additional package-builder dependency for those source forms.
 * The destination must not exist, so failed validation can safely remove all
 * untrusted extracted content.
 *
 * @param spec - npm-compatible package specification selected by the user.
 * @param destination - Nonexistent directory reserved for this extraction.
 * @param options - Optional approved npm registry configuration.
 * @returns Provenance metadata, validated artifact manifest, and extraction root.
 * @throws {Error} When source metadata, package content, or destination safety is invalid.
 */
export async function extractArtifact(
  spec: string,
  destination: string,
  options: ArtifactSourceOptions = {},
): Promise<ResolvedArtifact> {
  if (typeof spec !== "string" || !spec.trim()) throw new Error("artifact package spec is required");
  assertSupportedSpec(spec);
  const root = path.resolve(destination);
  if (fs.existsSync(root)) throw new Error("artifact extraction destination must not exist");
  // Pacote resolves npm-compatible specs and extracts them without node_modules.
  // Source: https://www.npmjs.com/package/pacote?activeTab=readme
  const pacoteOptions = { ignoreScripts: true, ...options };
  const packageManifest = validatePackageManifest(await pacote.manifest(spec, pacoteOptions));
  try {
    await pacote.extract(spec, root, pacoteOptions);
    assertOrdinaryFiles(root);
    return { package: packageManifest, manifest: readArtifactManifest(root), root };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
