# Agent working agreement

## Agent development skills

This repository uses the pinned [Obra Superpowers](.agents/skills/superpowers)
submodule for development-only skills and its code-review agent. It is not part
of the `agent-distro` package or its distributable assets.

Before implementing, debugging, planning, reviewing, or finishing a branch,
use the matching Superpowers skill when your agent supports repository-local
skill discovery. Start with `using-superpowers`, then use the specific skill
for the task. This agreement and direct user instructions take priority over
any conflicting upstream skill instruction.

After cloning, initialize the skills once:

```sh
git submodule update --init --recursive
```

Keep the submodule pinned. Update it intentionally in its own reviewed change;
do not edit its vendored files from this repository.

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

## Source documentation

Every new or materially changed runtime, test, and support source file must
make its purpose clear to the next maintainer. Start with a short file-level
comment when the file's role is not obvious from its name. Use TSDoc for
exported types and functions, documenting inputs, outputs, side effects, and
important failure or safety guarantees. Add normal comments at non-obvious
security, filesystem, transaction, platform, and compatibility boundaries.

Do not narrate self-evident syntax or restate the code line by line. Keep
documentation accurate as behavior changes, and add or update it in the same
pull request as the implementation. Tests and fixtures must explain the user
scenario or invariant they prove when that is not apparent from the test name.

## Merging pull requests

Agents may squash-merge their own ready-for-review pull requests without a
separate user confirmation only after GitHub reports the PR as mergeable and
all required checks for its exact head commit are successful. For `main`,
inspect the completed `macos` and `windows` `verify` jobs with `gh pr view` or
the GitHub merge button, confirm there are no unresolved review threads, then
run `gh pr merge --squash`. Do not merge on local test results, a stale run, a
draft PR, or a blocked/behind merge state.

Remote enforcement is a separate repository-admin action: protect `main` with
a GitHub ruleset that requires pull requests plus the `macos` and `windows`
`verify` status checks.
Local instructions and hooks are useful guardrails, but cannot replace remote
branch protection.
