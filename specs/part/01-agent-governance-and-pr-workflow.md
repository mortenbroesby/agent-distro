# Agent governance and pull-request workflow

**Status:** Done

**Priority:** 4

**Goal:** Make branch/worktree isolation and pull-request delivery the default
for every Agent Distro agent, then enforce the same policy remotely on `main`.

## Boundary

This epic distinguishes agent behavior from GitHub enforcement. `AGENTS.md`
can direct agents not to write `main`; only a repository-admin GitHub ruleset
can reject direct remote pushes or require review.

## Story 1 — Agent working agreement

**Status:** Done

### Tasks

- [x] Require a status/worktree audit before edits.
- [x] Require a named branch and dedicated worktree for concurrent work.
- [x] Forbid agents from committing or pushing directly to `main`.
- [x] Require a branch, commit, scope, and verified-check handoff.

Acceptance: a repository-local agent instruction makes safe concurrent and PR
workflow the default without relying on hidden local configuration.

## Story 2 — PR delivery contract

**Status:** Done

### Tasks

- [x] Define the minimum PR handoff: summary, verification evidence, and known
      gaps.
- [x] Require ready-for-review, non-draft PRs unless the user asks otherwise.
- [x] Require completed macOS and Windows `verify` evidence before handoff.
- [x] Add a PR template after an explicit user request.
- [x] Prove an Agent Distro change can be delivered from a branch without touching the
      shared checkout.

Acceptance: a reviewer can understand scope and proof without reconstructing
the branch history.

Evidence (2026-07-29): this pull request is the proof: it was created and
updated from `docs/worktree-protocol` in its own worktree. Its description
contains the scope, verification, and the remaining known gap. PR #1 added
`.github/pull_request_template.md` after an explicit user request.

## Story 3 — GitHub `main` ruleset

**Status:** Done

### Tasks

- [x] Confirm the repository owner authorizes a GitHub ruleset for `main`.
- [x] Inspect the repository ruleset API with the authenticated owner token.
- [x] Inspect the classic `main` branch-protection API with the authenticated
      owner token.
- [x] Require pull requests before merging to `main`.
- [x] Require the `macos` and `windows` GitHub Actions status checks.
- [x] Require branches to be current with `main` before merging.
- [x] Require resolved review threads and dismiss stale approvals.
- [x] Enforce squash-only linear history and reject direct, force-push, and deletion updates.

Acceptance: GitHub rejects direct updates to `main` and permits a PR only when
the required verification completes.

Evidence (2026-07-29): after the repository became public, GitHub ruleset
`Protect main` (ID `19987486`) was activated without bypass actors. It requires
pull requests, strict `macos` and `windows` checks, resolved threads, squash-only
linear history, and rejects direct updates, non-fast-forward pushes, and deletion.

## Story 4 — Optional local guardrail

**Status:** Done — not adopted

### Tasks

- [x] Assess whether a tracked pre-push hook would add protection beyond the
      remote ruleset without blocking legitimate maintainer recovery.
- [x] Decline adoption: Git does not install tracked hooks automatically, so a
      repository hook without a separate setup mechanism would create false
      assurance.
- [x] Retain the worktree and pull-request instructions as the available local
      guardrail until remote enforcement is available.

Acceptance: any local guardrail is narrow, documented, and never the sole
protection for `main`.

Evidence (2026-07-29): no existing hook installer or `core.hooksPath` setup
exists in this repository. Adding only a tracked hook would not protect fresh
clones, so it was deliberately not adopted.

## Completion

This epic is complete; move it to `specs/done/` with the next documentation-only
cleanup that touches the tracker.
