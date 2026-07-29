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
