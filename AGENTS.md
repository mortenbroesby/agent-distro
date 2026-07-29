# Agent working agreement

## Concurrent worktrees

This repository may have multiple Codex instances working at once. Treat the
primary checkout as shared coordination space, not a safe place for edits.

Before changing files:

1. Run `git status --short --branch` and `git worktree list --porcelain`.
2. If the primary checkout is dirty, assume changes belong to another agent
   unless you created them in this session.
3. Create a dedicated worktree on a named branch for your task, for example:
   `git worktree add -b <type>/<topic> <safe-path> main`.
4. Make, test, and commit only your worktree's changes. Never reset, clean,
   stash, move, or stage another worktree's changes.
5. Report the branch, worktree, commit, and verification evidence when handing
   work back. Merge or move work onto `main` only with explicit user direction.

Use a short branch prefix such as `feat/`, `fix/`, `docs/`, or `test/`. Reuse
an existing task branch/worktree when it already owns the requested scope.

## Pull-request delivery

Agents must not commit or push directly to `main`. Create a task branch, push
that branch, and open a pull request unless the user explicitly authorizes an
exception for a specific commit.

Open ready-for-review pull requests, not drafts, unless the user explicitly
asks for a draft. Before handing a PR off, wait for its macOS and Windows
`verify` jobs to finish successfully, then report the branch name, commit,
changed scope, completed-run evidence, and known gaps. Do not claim a hosted
check passed until its completed run is inspected.

`verify` runs for pull requests only. Do not expect a branch push to provide
current CI evidence; inspect the pull-request run for its exact head commit.

Before requesting review, fetch `origin` and rebase or merge the latest
`origin/main` into the task branch. Confirm
`git merge-base --is-ancestor origin/main HEAD` succeeds; a passing stale-base
CI run is not enough.

Remote enforcement is a separate repository-admin action: protect `main` with
a GitHub ruleset that requires pull requests and the `verify` status check.
Local instructions and hooks are useful guardrails, but cannot replace remote
branch protection.
