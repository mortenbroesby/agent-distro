# Agent Distro foundation epic

## Objective

Bring Agent Distro into compliance with the committed
[foundation brief](./agent-distro-foundation.md). The later ASDLC port is
out of scope: it should reuse this working foundation through a rename and
its own curated assets.

## Completion rule

Complete stories in order. Check a task only when its acceptance criteria have
direct evidence. Do not begin a story blocked by an unresolved decision or a
missing decision.

## Long-running delivery rule

Keep this epic and PR #39 active until the Q&A has reached a near conclusion.
When an item is too uncertain or disproportionately costly for this foundation,
record it here as **deferred** with its reason, the safe behavior that remains,
and the condition that would reopen it. A deferred item is not checked off.

## Story 0 — Establish the Agent Distro base

- [x] Identify the Agent Distro remote and base branch for the implementation stack.
- [x] Create an isolated Git worktree from that base; preserve the ASDLC reference snapshot unchanged.
- [x] Record the exact current command, asset, manifest, and test baseline.
- [x] Decide the remaining design questions required by Story 3.

Acceptance: a clean, Git-backed Agent Distro worktree exists with a verified baseline
and an approved first implementation slice.

### Story 0 evidence — 2026-07-30

- The rich ASDLC reference at `/Users/macbook/personal/external/f1it-asdlc-main` is
  a Git-less source snapshot. It exposes `doctor`, `bootstrap`, `install`,
  `update`, `validate`, and `self-update`; it has 33 test files, 6
  `managed-assets` files, and 75 `.github` assets.
- Agent Distro has an isolated implementation worktree at
  `/private/tmp/agent-distro-massive-refactor` on
  `agent/cli-bootstrap-refactor`. No ASDLC source-snapshot change has been made.
- The current CLI provides `doctor`, `recover`, `report-issue`, `profiles`, and
  `install`; it writes version-1 manifests under `.agent-distro/`, ships a
  generated asset catalog, and has transactional replacement/recovery.
- Node 22.23.1 baseline verification passed: `npm test` and `npm run
  test:proof`; the latter includes a packed-install lifecycle proof.

## Story 1 — Agent Distro runtime and bootstrap contract

- [x] Keep the public package and command as `agent-distro`.
- [x] Replace legacy parallel launch paths with one Node runtime.
- [x] Implement clone-then-bootstrap using a managed runtime at `~/.agent-distro/repo`
  by default, with an explicit alternate location.
- [x] Implement `agent-distro upgrade` against that managed checkout.
- [x] Prove packed global installation and upgrade on macOS and Windows.

Acceptance: the global CLI runs the managed Node runtime, bootstrap and upgrade
are cross-platform, and no legacy runtime remains on the normal command path.

### Story 1 evidence — 2026-07-30

- `bin/agent-distro bootstrap` creates a Git-backed managed checkout at
  `~/.agent-distro/repo`; `--home <directory>` provides an explicit alternate
  location. It then runs the packaged global CLI without installing assets.
- Both source and package launchers are Node entrypoints; `bootstrap` and
  `upgrade` are the only pre-build intercepts, so normal commands share the
  compiled runtime.
- `agent-distro upgrade` fast-forwards that managed checkout and reuses the
  bootstrap pack/install path, avoiding a second installer implementation.
- The package-facing test covers bootstrap and upgrade against an isolated
  global prefix, including detached managed checkouts. `npm test` and `npm run
  test:proof` pass locally on Node 22.23.1. Workflow run `30554171608` passed
  its macOS and Windows aggregate jobs plus the packed runtime matrix for Node
  20.12, 22.18, 24.11, and 26 on exact head `6233a21`.

## Story 2 — Stack-first catalog and selection

- [x] Design the source layout and generated catalog metadata for Common and
  technology stacks.
- [x] Move or curate assets into their declared stack ownership without duplicates.
- [x] Implement stack selection, then per-stack profile selection, then
  per-stack asset/category customization.
- [x] Start new installations with no selected assets.
- [x] Add characterization and generated-catalog checks.

Acceptance: every offered asset has one declared stack owner, selection is
explicit, and the catalog generation/checks are deterministic.

### Story 2 evidence — 2026-07-30

- The authored profile source declares an explicit Common stack and assigns
  every current profile to it; generated catalog schema version 2 records
  stack ownership for all assets and profiles.
- The Clack flow selects stacks before it shows stack-eligible profiles and
  individual assets. An empty selection is still a no-op.
- Catalog generation validates ownership and `assets:check` rejects stale
  output. Local `npm test` and `npm run test:proof` pass on Node 22.23.1.

## Story 3 — Target state and safe mutation

- [x] Preserve `.agent-distro/` as the target-local management area and define its
  versioned state schema.
- [x] Implement legacy-state detection and the approved migration path.
- [x] Warn when `install` finds existing Agent Distro state; prefill `update` from it.
- [x] Make deselection archive files under `.agent-distro/.archive/` and write the
  user-inspectable Markdown archive record.
- [x] Implement transactional staging, rollback, and recovery for writes and
  archives.

Acceptance: install/update never leave partial state, legacy handling is
tested, and every archived asset is visible to the user.

### Story 3 evidence — 2026-07-30

- Version-2 manifests record catalog version and the selected stacks, profiles,
  and individual assets. Version-1 manifests are read safely; catalog-known
  files prefill updates and the next successful mutation writes version 2.
- Existing installs warn through `install`; `update` loads the recorded selection.
  Deselected assets and `--force` replacements are copied to a unique
  `.agent-distro/.archive/<id>/` directory with a `README.md` record.
- The existing transaction journal now covers replacement and removal operations;
  rollback/recovery restore prior files before staging is removed. Focused installer
  coverage verifies deselection archive, force archive, rollback, and recovery.

## Story 4 — Shared paths and conflicts

- [ ] Define explicit compatible-merge rules for every shared target-path type.
- [ ] Merge compatible contributions from selected stacks.
- [ ] Offer an interactive provider choice for unmergeable conflicts before
  writing.
- [x] In scripts, fail conflicts without `--force`; with force, archive the
  displaced content before replacement.
- [x] Provide an opt-in bug-report path for fatal errors and force-required
  conflicts.

Acceptance: merge, choice, force, archive, and non-interactive failure paths
all have focused tests and no path silently chooses a conflicting provider.

### Story 4 current safe boundary

The current catalog rejects duplicate target paths, so it has no shared-path
providers to merge or choose between. This is a **deferred** catalog capability:
the safe behavior is an explicit conflict before any write; it reopens when a
second stack introduces a same-path asset together with a declared merge rule.
Non-interactive conflicts already fail unless `--force`; force archives the
displaced source asset, and the error text includes the opt-in issue-report path.

## Story 5 — Doctor and diagnostics

- [x] Report global CLI and managed-runtime state in every `agent-distro doctor` run.
- [x] Report target `.agent-distro/` state when the current directory or explicit
  target is a repository.
- [x] Treat an unmanaged current directory as a successful informational result.
- [x] Add a stable, path-safe `agent-distro doctor --json` contract.
- [x] Decide and test exit status for actual global or target damage.

Acceptance: doctor is useful to humans and CI, exposes neither secrets nor
absolute paths in JSON, and its exit semantics are documented and tested.

### Story 5 evidence — 2026-07-30

- Human doctor output always starts with the CLI/runtime and managed-checkout
  state, then reports either target verification or the informational unmanaged
  result. The target defaults to the current directory.
- `doctor --json` and `--diagnostics` emit the same path-safe snapshot with
  runtime, global, target, and manifest sections. Tests cover both aliases and
  prove no target path leaks into JSON.
- Missing global checkout and unmanaged target are successful informational
  results; malformed target state and managed-file drift exit nonzero.

## Story 6 — Delivery discipline

- [x] Maintain package, catalog, transaction, and cross-platform smoke
  coverage as each foundation story changes them.
- [x] Add formatting, linting, editor/runtime configuration, and repository
  instructions appropriate to Agent Distro.
- [x] Require macOS and Windows verification for the exact PR head.
- [ ] Split the work into the approved pull-request sequence and
  publish each story with evidence.

Acceptance: each delivered story is independently reviewable, rebased on its
base, and has passing exact-head hosted checks.

### Story 6 evidence — 2026-07-30

- `npm test`, `test:proof`, pack inspection, catalog verification, formatter,
  and linter cover the package and transaction paths locally. `.editorconfig`,
  `.npmrc`, `.nvmrc`, `.tool-versions`, and `AGENTS.md` establish the checked-in
  development baseline.
- The `verify` workflow runs the full suite and packed runtime proof on macOS
  and Windows. Workflow run `30554171608` passed macOS, Windows, and all eight
  packed runtime lanes for exact head `6233a21`.
- The requested delivery shape is one long-running PR, not one PR per story.
  Story-level commits and this epic preserve review boundaries. A multi-PR
  sequence is **deferred** until the user asks to split PR #39; the safe current
  behavior is a draft PR with required checks before merge.

## Open decisions

The remaining decisions live in the parity brief. Resolve only the decisions
needed for the next story; do not expand scope preemptively.
