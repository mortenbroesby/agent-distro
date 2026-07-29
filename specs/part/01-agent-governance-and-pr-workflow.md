# Agent governance and pull-request workflow

**Status:** Active

**Priority:** 4

**Goal:** Make branch/worktree isolation and pull-request delivery the default
for every ASDLC agent, then enforce the same policy remotely on `main`.

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
- [x] Prove an ASDLC change can be delivered from a branch without touching the
      shared checkout.

Acceptance: a reviewer can understand scope and proof without reconstructing
the branch history.

Evidence (2026-07-29): this pull request is the proof: it was created and
updated from `docs/worktree-protocol` in its own worktree. Its description
contains the scope, verification, and the remaining known gap. PR #1 added
`.github/pull_request_template.md` after an explicit user request.

## Story 3 — GitHub `main` ruleset

**Status:** Blocked — current GitHub plan does not support private-repository rulesets

### Tasks

- [x] Confirm the repository owner authorizes a GitHub ruleset for `main`.
- [x] Inspect the repository ruleset API with the authenticated owner token.
- [x] Inspect the classic `main` branch-protection API with the authenticated
      owner token.
- [ ] Require pull requests before merging to `main`.
- [ ] Require the `verify` GitHub Actions status check.
- [ ] Decide whether one approval and stale-review dismissal are appropriate
      for this small repository.
- [ ] Attempt a harmless direct-push rejection and record the result.

Acceptance: GitHub rejects direct updates to `main` and permits a PR only when
the required verification completes.

Evidence (2026-07-29): GitHub rejected both
`GET /repos/mortenbroesby/agent-distro/rulesets` and
`GET /repos/mortenbroesby/agent-distro/branches/main/protection` with HTTP
403: this private repository needs GitHub Pro or must be made public to use
these enforcement features. Revisit after a plan change; the current
branch/worktree and pull-request instructions remain the available local
workflow guardrails.

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

Move this epic to `specs/done/` only after remote ruleset evidence exists.
