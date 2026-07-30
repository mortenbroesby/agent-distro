# CLI and Bootstrap Refactor Design

## Goal

Make Agent Distro easy to install from a local checkout while giving each CLI
interaction and runtime concern one clear owner.

## Scope

The local checkout is the source of truth. A user clones Agent Distro, runs one
portable Node script, and receives a globally available `agent-distro` command.
The bootstrap must install the packed artifact that users will actually run; it
must not silently install assets into another repository.

No npm publication, shell-specific scripts, `npm link`, or new dependencies
are introduced.

## Public commands

The CLI retains `install`, `recover`, `profiles`, and `report-issue`. It
replaces the separate `verify` and `diagnostics` commands with one doctor
interaction:

```text
agent-distro install [target]
agent-distro recover <target>
agent-distro doctor [target]
agent-distro doctor --diagnostics [target]
agent-distro profiles
agent-distro report-issue
```

`install` without a target remains the guided TUI flow, which prompts for a
target. `doctor` without a target uses the current working directory. `doctor
[target]` performs the existing verification behavior; `--diagnostics` prints
the existing sanitized diagnostic snapshot instead. The pre-v1 CLI may remove
`verify` and `diagnostics`; no compatibility aliases are retained.

## Bootstrap contract

`scripts/bootstrap.mjs` builds from the checkout on Node `^22.18.0` or
`>=24.11.0 <27`, matching tsdown's build-only requirement. The packed CLI
remains runnable on Node `>=20.12.0 <27`. With no arguments, the bootstrap:

1. Runs `npm ci` in the checkout.
2. Runs `npm pack --json --pack-destination <temporary-directory>`.
3. Installs the resulting tarball with `npm install --global --force`.
4. Runs `agent-distro --help` to prove the global command resolves.
5. Deletes the temporary package directory in success and failure paths.

`node scripts/bootstrap.mjs --doctor <target>` performs the same setup, then
runs `agent-distro doctor <target>`. It never calls `install`; applying assets
always remains an explicit later command. Errors from npm, global-install
permissions, the CLI, or doctor are passed through with a non-zero exit code.

## Runtime structure

```text
src/agent-distro.ts          package exports only
src/cli.ts                   Commander construction and top-level parse boundary
src/commands/install.ts      install command registration and flag translation
src/commands/doctor.ts       doctor command registration
src/commands/profiles.ts     profile-list command registration
src/commands/report-issue.ts issue-report command registration
src/install.ts               transactional installation and recovery core
src/interactive-install.ts   Clack prompt flow and TTY gate
src/doctor.ts                verification and diagnostics core
```

`cli.ts` owns no command-specific options or action logic. Command modules own
Commander syntax and translate only their command's inputs to core functions.
`install.ts` never imports Clack; `interactive-install.ts` owns all prompt
library interaction and calls the transactional installer through its existing
function interface.

## Error handling and safety

The existing stable failure codes, destination checks, transaction journal, and
explicit `--force` semantics remain unchanged. The bootstrap uses a temporary
tarball directory rather than writing package archives into the checkout.
Global npm permission failures are reported rather than worked around with
privileged commands or environment changes.

## Verification

Focused tests must prove the new doctor command, removal of the old top-level
doctor names, and bootstrap argument validation. A disposable integration run
must set an isolated npm global prefix, run the bootstrap, then invoke the
installed command. The full formatter, linter, unit/package suite, direct
proof, package dry run, and required macOS/Windows PR checks must pass.
