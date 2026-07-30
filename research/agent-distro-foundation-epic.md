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

## Story 0 — Establish the Agent Distro base

- [x] Identify the Agent Distro remote and base branch for the implementation stack.
- [x] Create an isolated Git worktree from that base; preserve the ASDLC reference snapshot unchanged.
- [x] Record the exact current command, asset, manifest, and test baseline.
- [ ] Decide the remaining design questions required by Story 3.

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
- [ ] Replace legacy parallel launch paths with one Node runtime.
- [x] Implement clone-then-bootstrap using a managed runtime at `~/.agent-distro/repo`
  by default, with an explicit alternate location.
- [x] Implement `agent-distro upgrade` against that managed checkout.
- [ ] Prove packed global installation and upgrade on macOS and Windows.

Acceptance: the global CLI runs the managed Node runtime, bootstrap and upgrade
are cross-platform, and no legacy runtime remains on the normal command path.

### Story 1 evidence — 2026-07-30

- `bin/agent-distro bootstrap` creates a Git-backed managed checkout at
  `~/.agent-distro/repo`; `--home <directory>` provides an explicit alternate
  location. It then runs the packaged global CLI without installing assets.
- `agent-distro upgrade` fast-forwards that managed checkout and reuses the
  bootstrap pack/install path, avoiding a second installer implementation.
- The package-facing test covers bootstrap and upgrade against an isolated
  global prefix; `npm test` and `npm run test:proof` pass locally on Node
  22.23.1. Hosted macOS and Windows exact-head proof is still required.

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

- [ ] Preserve `.agent-distro/` as the target-local management area and define its
  versioned state schema.
- [ ] Implement legacy-state detection and the approved migration path.
- [ ] Warn when `install` finds existing Agent Distro state; prefill `update` from it.
- [ ] Make deselection archive files under `.agent-distro/.archive/` and write the
  user-inspectable Markdown archive record.
- [ ] Implement transactional staging, rollback, and recovery for writes and
  archives.

Acceptance: install/update never leave partial state, legacy handling is
tested, and every archived asset is visible to the user.

## Story 4 — Shared paths and conflicts

- [ ] Define explicit compatible-merge rules for every shared target-path type.
- [ ] Merge compatible contributions from selected stacks.
- [ ] Offer an interactive provider choice for unmergeable conflicts before
  writing.
- [ ] In scripts, fail conflicts without `--force`; with force, archive the
  displaced content before replacement.
- [ ] Provide an opt-in bug-report path for fatal errors and force-required
  conflicts.

Acceptance: merge, choice, force, archive, and non-interactive failure paths
all have focused tests and no path silently chooses a conflicting provider.

## Story 5 — Doctor and diagnostics

- [ ] Report global CLI and managed-runtime state in every `agent-distro doctor` run.
- [ ] Report target `.agent-distro/` state when the current directory or explicit
  target is a repository.
- [ ] Treat an unmanaged current directory as a successful informational result.
- [ ] Add a stable, path-safe `agent-distro doctor --json` contract.
- [ ] Decide and test exit status for actual global or target damage.

Acceptance: doctor is useful to humans and CI, exposes neither secrets nor
absolute paths in JSON, and its exit semantics are documented and tested.

## Story 6 — Delivery discipline

- [ ] Maintain package, catalog, transaction, and cross-platform smoke
  coverage as each foundation story changes them.
- [ ] Add formatting, linting, editor/runtime configuration, and repository
  instructions appropriate to Agent Distro.
- [ ] Require macOS and Windows verification for the exact PR head.
- [ ] Split the work into the approved pull-request sequence and
  publish each story with evidence.

Acceptance: each delivered story is independently reviewable, rebased on its
base, and has passing exact-head hosted checks.

## Open decisions

The remaining decisions live in the parity brief. Resolve only the decisions
needed for the next story; do not expand scope preemptively.
