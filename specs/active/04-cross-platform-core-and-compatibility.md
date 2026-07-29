# Cross-platform core and compatibility contract

**Status:** Active

**Priority:** 0

**Goal:** Make Agent Distro's target semantics and no-op behavior explicit and
prove the packaged CLI on macOS and Windows Git Bash.

## Contract

- Any existing directory is a valid target; a Git repository is not required.
- A monorepo is not discovered or rewritten: Agent Distro changes exactly the
  directory passed to `install`.
- An unchanged install is a true no-op: it creates no staging directory,
  recovery journal, or managed-file write.
- Windows Git Bash is a supported command environment and receives the same
  Node/npm packaged proof as macOS.

## Story 1 — Explicit target semantics

**Status:** Done

### Tasks

- [x] Add disposable tests for a non-Git directory and a Git-initialized repository.
- [x] Add a monorepo fixture whose root and nested package are independently targeted.
- [x] Assert no install writes outside the supplied target in every scenario.
- [x] Record the supported no-Git and monorepo behavior in CLI help or diagnostics.

Acceptance: target selection is deterministic without Git-root discovery.

## Story 2 — True unchanged-install no-op

**Status:** Done

### Tasks

- [x] Return before creating transactional state when the planned change set is empty.
- [x] Preserve the existing dry-run summary and conflict behavior.
- [x] Add a regression test that observes no staging or recovery write on a repeated install.

Acceptance: a repeated unchanged install leaves the filesystem untouched.

## Story 3 — Hosted Windows Git Bash proof

**Status:** Active

### Tasks

- [x] Run the Windows `verify` job explicitly with Git Bash.
- [x] Keep `npm ci`, focused tests, and packed-package proof in that shell.
- [ ] Record a completed macOS and Windows-Git-Bash run for the exact PR head.

Acceptance: the supported Git Bash path is verified rather than inferred from
the default Windows shell.

## Story 4 — Contract closeout

**Status:** Ready

### Tasks

- [ ] Reconcile `.memory/00` and `.memory/01` with the implemented contract.
- [ ] Check acceptance criteria only with direct tests or completed hosted evidence.
- [ ] Move this epic to `../done/` when every story is complete.

Acceptance: the original cross-platform and compatibility proposals have one
current, evidence-backed source of truth.
