# npm dependency hardening spike

## Status

Proposed — planning only. No package, lockfile, runtime, or workflow change is
part of this spike.

## Decision

Keep the present dependency choices. They are mainstream, actively maintained,
and narrowly used. Do not add a library merely to replace Node APIs or the
installer's deliberately explicit transaction and path-safety logic.

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
| `execa` | `9.6.1`, dev-only test fixture process runner | 590.6M monthly downloads; latest is `10.0.0` (2026-07-17) | Keep; do not move runtime scripts to it. Consider a focused test-only major-upgrade spike. |
| `tsdown` | `0.22.14`, dev-only ESM package build | 12.8M monthly downloads; `0.22.14` is the current stable release, while `0.23.0-beta.1` is a separate prerelease | Keep at the locked stable line. It is pre-1.0, so review minor upgrades as potentially breaking and require packed Windows/macOS proof. |
| `vitest` | `4.1.10`, dev-only test runner | 334.2M monthly downloads; `4.1.10` is current stable, with a separate 5.0 beta line | Keep. No update or replacement is justified now. |
| `oxfmt` | `0.61.0`, dev-only formatter | 35.9M monthly downloads; current release is `0.61.0` (2026-07-27) | Keep, but monitor as a pre-1.0 native-binding tool. |
| `oxlint` | `1.76.0`, dev-only linter | 49.7M monthly downloads; current release is `1.76.0` (2026-07-27) | Keep. It is stable-major and already current. |

The locked graph contains 8 production, 203 development, and 111 optional
dependencies (210 total). Direct packages have registry URLs and integrity
hashes. None of the seven direct packages declares an install script. Oxfmt and
Oxlint deliberately resolve platform-specific optional native bindings; the
existing macOS and Windows CI lanes are the correct protection for that boundary.

## Usage-based replacement review

| Area | Current approach | Candidate | Finding |
| --- | --- | --- | --- |
| Command parsing | Commander | `yargs`, `cac`, `clipanion` | No change. Commander is already highly adopted and maps directly to the current command-registration structure. |
| Interactive TUI | Clack task log and prompts | `inquirer`, `prompts`, `enquirer` | No change. Clack already supplies the requested TUI primitives without custom rendering infrastructure. |
| Runtime process execution | Node `spawnSync` / `execFileSync` | `execa` | No runtime change. Bootstrap deliberately invokes npm's JavaScript entrypoint on Windows to preserve paths with spaces and Unicode; wrapping it would not remove that platform rule. |
| Filesystem transactions | Node `fs`, explicit journal, path validation | `fs-extra`, `write-file-atomic`, `proper-lockfile` | No change. These do not model Agent Distro's multi-file archive, rollback, recovery, and symlink safety contract. Replacing it would add a dependency without removing the important policy code. |
| Catalog and manifest validation | Small local validation functions | `zod`, `valibot` | Defer. A schema library becomes worthwhile only if one schema must serve CLI input, persisted state migrations, generated catalog validation, and a public programmatic API. The current focused validators are smaller and safer to audit. |
| JSON provider merge | Small pure recursive merge | `deepmerge`, `lodash.merge` | No change. The merge semantics are intentionally closed and conflict-aware; generic merge defaults are not a safety upgrade. |
| Formatting and linting | Oxfmt / Oxlint | Prettier / ESLint | No change. The current tools are mainstream enough, current, and already verified on both supported OS families. |

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
  meaningful adoption, and compatible Node 20.12 through 26 support.
- Its lockfile and lifecycle-script impact are reviewed before execution.
- A packed macOS and Windows proof demonstrates the added behavior.
- The proposal identifies the code removed or risk reduced; convenience alone is
  not enough.

## Sources

- [npm audit documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit/)
- [npm lockfile documentation](https://docs.npmjs.com/cli/v6/configuring-npm/package-lock-json/?v=true)
- [npm install and lockfile behavior](https://docs.npmjs.com/cli/install/)
- [tsdown documentation](https://tsdown.dev/guide/)
- [Oxc project documentation](https://oxc.rs/)
- Registry download endpoints, queried 2026-07-30: `https://api.npmjs.org/downloads/point/last-month/<package>`
- Registry metadata, queried 2026-07-30: `npm view <package> version time --json`

## Review cadence

Re-run this spike when adding a direct dependency, before a public npm release,
or every 90 days. Re-evaluate a retained pre-1.0 build or formatting tool when
its next minor release is proposed.
