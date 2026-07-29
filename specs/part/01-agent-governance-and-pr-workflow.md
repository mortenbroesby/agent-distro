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
- [ ] Add a PR template only if repeated reviews show that the instruction is
      insufficient.
- [x] Prove an ASDLC change can be delivered from a branch without touching the
      shared checkout.

Acceptance: a reviewer can understand scope and proof without reconstructing
the branch history.

Evidence (2026-07-29): this pull request is the proof: it was created and
updated from `docs/worktree-protocol` in its own worktree. Its description
contains the scope, verification, and the remaining known gap. A template is
not warranted until repeated review shows that the documented handoff is
insufficient.

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

**Status:** Ready

### Tasks

- [ ] Assess whether a tracked pre-push hook would add protection beyond the
      remote ruleset without blocking legitimate maintainer recovery.
- [ ] If adopted, reject only `git push origin main` and leave all branch pushes
      untouched.
- [ ] Test the hook with representative command arguments.

Acceptance: any local guardrail is narrow, documented, and never the sole
protection for `main`.

## Completion

Move this epic to `specs/done/` only after remote ruleset evidence exists.
