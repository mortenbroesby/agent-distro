# npm dependency hardening spike

## Status

Implemented for the first artifact-source milestone on PR #43. The package,
lockfile, Node baseline, and resolver changed only for that approved scope;
every other candidate remains deferred until its documented trigger is met.

## Decision

Keep the present dependency choices. They are mainstream, actively maintained,
and narrowly used. Do not add a library merely to replace Node APIs or the
installer's deliberately explicit transaction and path-safety logic.

The first approved scope trigger is external artifact packages: a user selects
an npm-style package specification and Agent Distro resolves it as content,
outside `node_modules`. That feature warrants a dedicated package-resolution
dependency spike. Concurrent installation is a separate safety trigger for a
lockfile spike.

Agent Distro's runtime contract is Node
`^22.22.2 || ^24.15.0 || >=26.0.0 <27`. This intentionally drops Node 20 and
aligns the package with current npm-maintained resolution tooling. Package,
bootstrap, launcher, CI, and packed-runtime proof use that same range.

Open small, independently verified upgrade spikes for `commander` and
test-only `execa`. Keep `tsdown`, `oxfmt`, and `oxlint` on a monitored update
cadence because their releases move quickly; that is not a reason to replace
them today.

## Scope and method

This review covers every direct dependency in `package.json`, its actual import
site, and the committed `package-lock.json` on `origin/main` at `079a0f6`
(2026-07-30). Maturity is evaluated from the public npm registry's last-30-day
downloads, stable-release status, release recency, ownership, and the size of
the locked transitive graph. Download count is a useful adoption signal, not a
security guarantee.

The lockfile is the authoritative install boundary. It pins registry tarballs
with integrity data; `npm audit --package-lock-only --json` reported zero known
vulnerabilities: 0 critical, high, moderate, low, and informational findings.

## Direct dependency assessment

| Package | Locked version and role | Registry evidence, 2026-07-30 | Decision |
| --- | --- | --- | --- |
| `@clack/prompts` | `1.7.0`, runtime TUI adapter in `src/interactive-install.ts` | 67.0M monthly downloads; current stable release is `1.7.0` (2026-07-03) | Keep. It is the purpose-built terminal UX dependency and has no alpha version in the resolved graph. |
| `commander` | `14.0.3`, runtime command parser in `src/cli.ts` and command registrars | 1.849B monthly downloads; latest is `15.0.0` (2026-05-29) | Keep; do not replace. Create a focused major-upgrade spike because the current range intentionally excludes 15. |
| `pacote` | `22.0.0`, runtime artifact resolver in `src/artifact-source.ts` | 13.9M weekly / 54.2M monthly downloads; 80 KB published unpacked size; npm-maintained | Adopted for registry/tag/tarball artifacts only. It adds 93 locked packages; lifecycle scripts are disabled and artifact packages declaring lifecycle hooks are rejected. |
| `execa` | `9.6.1`, dev-only test fixture process runner | 590.6M monthly downloads; latest is `10.0.0` (2026-07-17) | Keep; do not move runtime scripts to it. Consider a focused test-only major-upgrade spike. |
| `tsdown` | `0.22.14`, dev-only ESM package build | 12.8M monthly downloads; `0.22.14` is the current stable release, while `0.23.0-beta.1` is a separate prerelease | Keep at the locked stable line. It is pre-1.0, so review minor upgrades as potentially breaking and require packed Windows/macOS proof. |
| `vitest` | `4.1.10`, dev-only test runner | 334.2M monthly downloads; `4.1.10` is current stable, with a separate 5.0 beta line | Keep. No update or replacement is justified now. |
| `oxfmt` | `0.61.0`, dev-only formatter | 35.9M monthly downloads; current release is `0.61.0` (2026-07-27) | Keep, but monitor as a pre-1.0 native-binding tool. |
| `oxlint` | `1.76.0`, dev-only linter | 49.7M monthly downloads; current release is `1.76.0` (2026-07-27) | Keep. It is stable-major and already current. |

The locked graph contains 101 production, 200 development, and 113 optional
dependencies (302 total). Direct packages have registry URLs and integrity
hashes. None of the eight direct packages declares an install lifecycle script. Oxfmt and
Oxlint deliberately resolve platform-specific optional native bindings; the
existing macOS and Windows CI lanes are the correct protection for that boundary.

## Usage-based replacement review

| Area | Current approach | Candidate | Finding |
| --- | --- | --- | --- |
| Command parsing | Commander | `yargs`, `cac`, `clipanion` | No change. Commander is already highly adopted and maps directly to the current command-registration structure. |
| Interactive TUI | Clack task log and prompts | `inquirer`, `prompts`, `enquirer` | No change. Clack already supplies the requested TUI primitives without custom rendering infrastructure. |
| Runtime process execution | Node `spawnSync` / `execFileSync` | `execa` | No runtime change. Bootstrap deliberately invokes npm's JavaScript entrypoint on Windows to preserve paths with spaces and Unicode; wrapping it would not remove that platform rule. |
| Filesystem transactions | Node `fs`, explicit journal, path validation | `fs-extra`, `write-file-atomic` | No change. These do not model Agent Distro's multi-file archive, rollback, recovery, and symlink safety contract. Replacing them would add a dependency without removing the important policy code. |
| Concurrent mutation | No interprocess coordination | `proper-lockfile` | Focused spike approved. It complements rather than replaces the transaction model; lock only the exact target and managed-global state. |
| Catalog and manifest validation | Small local validation functions | `zod`, `valibot` | Defer. A schema library becomes worthwhile only if one schema must serve CLI input, persisted state migrations, generated catalog validation, and a public programmatic API. The current focused validators are smaller and safer to audit. |
| JSON provider merge | Small pure recursive merge | `deepmerge`, `lodash.merge` | No change. The merge semantics are intentionally closed and conflict-aware; generic merge defaults are not a safety upgrade. |
| Formatting and linting | Oxfmt / Oxlint | Prettier / ESLint | No change. The current tools are mainstream enough, current, and already verified on both supported OS families. |

## Artifact-package distribution decision

### `pacote`: approved only for the artifact-package milestone

`pacote` is npm's package downloader and exposes the operations this product
needs: manifest inspection and extraction of npm registry, tag, and tarball
specifications. Its current adoption is strong (54.2M monthly downloads), and
it is a better foundation than reproducing npm's package-spec, registry, cache,
and integrity behavior.

The resolver accepts an explicitly supplied registry for package and tag
resolution. Its in-process test registry proves metadata resolution, tag
selection, tarball extraction, and the SHA-512 integrity value returned to the
caller without relying on a public registry during tests.

Current `pacote@22` requires Node `^22.22.2 || ^24.15.0 || >=26`, matching the
new runtime contract. Do not soften this contract to generic “Node 22+”: early
22 releases still cannot run the current package. Pacote brings a substantial
npm-internal dependency graph, including
`npm-package-arg`, `npm-registry-fetch`, cache, tar, integrity, Git, and script
helpers. The spike must prove that resolving and extracting an artifact never
runs package lifecycle scripts or arbitrary package executables. The initial
implementation passes `ignoreScripts: true`, rejects packages that declare a
lifecycle script, and validates every extracted manifest path before a renderer
can read it.

Pacote's directory and Git fetchers need an `Arborist` constructor to build a
tarball. Defer those source forms instead of adding that additional npm-internal
tree now: reject them before Pacote is called, with an actionable message. A
future dedicated spike may add `@npmcli/arborist` only after a cross-platform
proof demonstrates its script-disabled behavior and its transitive cost is
worth the local/Git authoring workflow.

Keep the npm-specific implementation in one `artifact-source` module. Its
single `extractArtifact` operation is exported for programmatic consumers; do
not introduce a source interface or second resolver until another source
genuinely exists.
The installation engine continues to own the Agent Distro manifest, allowed
artifact types, target rendering, preview, approval, conflict policy,
ownership, rollback, and governance.

### Related distribution candidates

| Candidate | Current evidence | Decision |
| --- | --- | --- |
| `npm-package-arg` | 121.4M monthly downloads; latest 14 matches the new Node runtime contract | Do not add directly in the first pacote milestone: pacote already owns it. Add only if UI must classify a spec before a resolver call. |
| `npm-registry-fetch` | Already transitive through current pacote | Defer. Use pacote unless a concrete authenticated registry/search feature needs lower-level control. |
| `@npmcli/arborist` | 5.8M weekly downloads; 599 KB published unpacked size; npm-maintained | Defer. It is mainstream enough, but the first resolver has no current local/Git authoring requirement. Add only through a dedicated local/Git-source security spike. |
| `semver` | 3.396B monthly downloads; Node >=10 | Defer until manifests express compatibility ranges, minimum Agent Distro versions, or update policy. Package tags and exact metadata do not need a direct semver dependency. |

## Cross-platform operations and state candidates

| Candidate | Current evidence | Decision |
| --- | --- | --- |
| `proper-lockfile` | 79.2M monthly downloads; small lock/retry dependency graph | Approved for a focused concurrency spike. Lock the exact target installation and managed global state, release in `finally`, use a bounded wait, and prove competing processes cannot interleave. Do not introduce a global lock. |
| `env-paths` | 347.9M monthly downloads; Node >=20 | Defer. It is the preferred choice if a new cache/config/log location is introduced, but it must not silently migrate the deliberate `~/.agent-distro/repo` managed-checkout contract. |
| `fast-glob` | 596.2M monthly downloads | Defer. Artifact manifests should be authoritative. Add only when the manifest deliberately supports glob patterns or discovery across multiple roots. |
| `write-file-atomic` | 387.2M monthly downloads; current v8 matches the new Node runtime contract | Do not add now. The installer already stages every visible replacement and journals multi-file rollback; a single-file helper would not replace that transaction. Reconsider only after a demonstrated journal-write corruption case. |
| `tempy`, `cpy`, `rimraf` | `fs.mkdtemp`, `fs.cp`, and `fs.rm` cover the current use | Do not add. |

## CLI and interaction candidates

| Candidate | Current evidence | Decision |
| --- | --- | --- |
| `@inquirer/prompts` | 136.9M monthly downloads; Node >=20.17 / 22.13 / 23.5 | Do not add alongside Clack. Revisit only if Clack lacks a required interaction that cannot be composed. |
| `ink` / `@inkjs/ui` | Ink has 18.6M monthly downloads and requires Node >=22 | Do not add. A persistent full-screen application is outside the installation-wizard scope; Node compatibility is no longer the deciding concern. |
| `oclif` | 1.4M monthly downloads | Do not add. Commander and the npm global package meet the current command and update needs; evaluate only for a deliberate standalone-binary/plugin-platform migration. |
| `execa` | Already present as a dev-only test dependency | Keep runtime bootstrap on Node child-process APIs. Add a small process helper backed by Execa only when several production integrations need cancellation, timeouts, and structured errors; do not add a wrapper for the current few calls. |
| `which` | 1.303B monthly downloads; newest v7 matches the new Node runtime contract | Defer until `doctor` actually probes Git, GitHub CLI, or Copilot CLI. Use the current major and test Windows PATH behavior. |
| `open` | 486.7M monthly downloads; Node >=20 | Defer. The current report command prints a reviewable URL; adopt only for an explicit, consented `--open` action and validate the destination before opening it. |

## Supply-chain hardening gap

The current lockfile audit is clean, but the repository does not yet document a
recurring dependency review policy. Add a lightweight CI/release guard rather
than a new runtime package:

1. Run `npm audit --package-lock-only --json` in CI and fail on a triaged
   critical or high finding.
2. Run `npm audit signatures` after `npm ci`; it needs installed packages, so
   it could not be meaningfully evaluated in this uninstalled research worktree.
3. Enable a native GitHub dependency-update mechanism (Dependabot) for npm and
   GitHub Actions. Group routine dev-tool updates; leave runtime majors as
   individual PRs with cross-platform package proof.
4. Require every new dependency PR to record purpose, direct import site,
   license, maintenance/adoption evidence, install-script status, transitive
   impact, and the removal condition.

Do not use `npm audit fix --force` automatically. It can cross semver ranges and
does not establish that an advisory is reachable in Agent Distro's shipped path.

## Triggers that justify a new dependency

Add a dependency only when all apply:

- A concrete production requirement or defect cannot be met safely with Node,
  an existing dependency, or the existing small local helper.
- The candidate has a stable non-prerelease release, clear ownership and license,
  meaningful adoption, and support for Node `^22.22.2 || ^24.15.0 || >=26.0.0 <27`.
- Its lockfile and lifecycle-script impact are reviewed before execution.
- A packed macOS and Windows proof demonstrates the added behavior.
- The proposal identifies the code removed or risk reduced; convenience alone is
  not enough.

## Dependency admission evidence

Record the following in the dependency PR and this spike before adding a direct
runtime dependency:

1. A concrete user or product workflow that needs it now, plus the Node or
   existing-code alternative that cannot meet the requirement safely.
2. Stable release, clear owner/license, and at least 1M npm downloads in the
   preceding week. A lower-volume exception needs a first-party/platform owner
   and an explicit review rationale; all-time downloads alone are insufficient.
3. Published unpacked size and the lockfile delta: direct and total package
   count, production/optional package count, lifecycle scripts, and native
   bindings. Measure the shipped impact with `npm pack --dry-run`; do not use a
   package's own size as a proxy for its transitive graph.
4. Native lockfile audit and signature/provenance evidence after `npm ci`, plus
   a packed macOS and Windows proof for the exact PR head.

There is no universal byte cap: a substantial, established dependency is
appropriate when it replaces a security-sensitive protocol or platform-specific
implementation. A smaller library without a current use case is still rejected.

## Sources

- [npm audit documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit/)
- [npm lockfile documentation](https://docs.npmjs.com/cli/v6/configuring-npm/package-lock-json/?v=true)
- [npm install and lockfile behavior](https://docs.npmjs.com/cli/install/)
- [pacote API](https://www.npmjs.com/package/pacote?activeTab=readme)
- [tsdown documentation](https://tsdown.dev/guide/)
- [Oxc project documentation](https://oxc.rs/)
- Registry download endpoints, queried 2026-07-30: `https://api.npmjs.org/downloads/point/last-week/<package>` and `https://api.npmjs.org/downloads/point/last-month/<package>`
- Registry metadata, queried 2026-07-30: `npm view <package> version time --json`

## Review cadence

Re-run this spike when adding a direct dependency, before a public npm release,
or every 90 days. Re-evaluate a retained pre-1.0 build or formatting tool when
its next minor release is proposed.
