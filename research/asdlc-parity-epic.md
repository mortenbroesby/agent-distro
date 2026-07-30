# ASDLC parity epic

## Objective

Bring ASDLC into compliance with the committed
[parity and migration brief](./asdlc-parity-and-migration.md). ASDLC remains
the public product; Agent Distro supplies the implementation foundation.

## Completion rule

Complete stories in order. Check a task only when its acceptance criteria have
direct evidence. Do not begin a story blocked by an unresolved decision or a
missing Git-backed ASDLC base.

## Story 0 — Establish the integration base

- [ ] Identify the canonical ASDLC remote and base branch for the integration stack.
- [ ] Create an isolated Git worktree from that base; preserve the source snapshot unchanged.
- [ ] Record the exact current command, asset, manifest, and test baseline.
- [ ] Decide the remaining migration questions required by Stories 1–3.

Acceptance: a clean, Git-backed ASDLC worktree exists with a verified baseline
and an approved first implementation slice.

### Story 0 evidence — 2026-07-30

- The rich reference at `/Users/macbook/personal/external/f1it-asdlc-main` is
  a Git-less source snapshot. It exposes `doctor`, `bootstrap`, `install`,
  `update`, `validate`, and `self-update`; it has 33 test files, 6
  `managed-assets` files, and 75 `.github` assets.
- Its documented canonical remote is
  `danskebank@danskebank.ghe.com:main/f1it-asdlc.git`.
- This host currently cannot reach that remote: SSH requires an unverified
  host key and HTTPS has no configured enterprise credential. No integration
  worktree or source-snapshot change has been made.

## Story 1 — Public runtime and bootstrap contract

- [ ] Keep the public package and command as `asdlc`.
- [ ] Replace legacy parallel launch paths with one Node runtime.
- [ ] Implement clone-then-bootstrap using a managed runtime at `~/.asdlc/repo`
  by default, with an explicit alternate location.
- [ ] Implement `asdlc upgrade` against that managed checkout.
- [ ] Prove packed global installation and upgrade on macOS and Windows.

Acceptance: the global CLI runs the managed Node runtime, bootstrap and upgrade
are cross-platform, and no legacy runtime remains on the normal command path.

## Story 2 — Stack-first catalog and selection

- [ ] Design the source layout and generated catalog metadata for Common and
  technology stacks.
- [ ] Move or curate assets into their declared stack ownership without duplicates.
- [ ] Implement stack selection, then per-stack profile selection, then
  per-stack asset/category customization.
- [ ] Start new installations with no selected assets.
- [ ] Add characterization and generated-catalog checks.

Acceptance: every offered asset has one declared stack owner, selection is
explicit, and the catalog generation/checks are deterministic.

## Story 3 — Target state and safe mutation

- [ ] Preserve `.asdlc/` as the target-local management area and define its
  versioned state schema.
- [ ] Implement legacy-state detection and the approved migration path.
- [ ] Warn when `install` finds existing ASDLC state; prefill `update` from it.
- [ ] Make deselection archive files under `.asdlc/.archive/` and write the
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

- [ ] Report global CLI and managed-runtime state in every `asdlc doctor` run.
- [ ] Report target `.asdlc/` state when the current directory or explicit
  target is a repository.
- [ ] Treat an unmanaged current directory as a successful informational result.
- [ ] Add a stable, path-safe `asdlc doctor --json` contract.
- [ ] Decide and test exit status for actual global or target damage.

Acceptance: doctor is useful to humans and CI, exposes neither secrets nor
absolute paths in JSON, and its exit semantics are documented and tested.

## Story 6 — Delivery discipline

- [ ] Port the relevant package, catalog, transaction, and cross-platform
  smoke coverage from Agent Distro.
- [ ] Add formatting, linting, editor/runtime configuration, and repository
  instructions appropriate to ASDLC.
- [ ] Require macOS and Windows verification for the exact PR head.
- [ ] Split the work into the approved stacked pull-request sequence and
  publish each story with evidence.

Acceptance: each delivered story is independently reviewable, rebased on its
base, and has passing exact-head hosted checks.

## Open decisions

The remaining decisions live in the parity brief. Resolve only the decisions
needed for the next story; do not expand scope preemptively.
