# Transactional install and recovery

**Status:** Active

**Priority:** 0

**Parent:** [Reliable installation and diagnostics](./00-reliable-installation-and-diagnostics.md), Story 3

**Goal:** A failed install never leaves a partial Agent Distro asset set. Agent Distro stages
every intended file, commits as one recoverable operation, and can restore a
known-complete prior state after an interrupted commit.

## Non-goals

- No registry, lockfile, content cache, background daemon, or cross-process
  coordinator.
- No promise of concurrent writers being merged; a concurrent mutation fails
  safely and tells the user to rerun.

## Story 1 — Staging boundary

**Status:** Done

### Tasks

- [x] Represent every changed asset and manifest as an immutable planned write.
- [x] Write every planned file into one private staging directory before
      replacing any managed destination file.
- [x] Remove the new staging directory when staging fails, leaving destination
      files unchanged.
- [x] Add focused tests for a staged-write failure and for no final-file change.

Acceptance: all file content is available for commit before the first managed
destination is replaced.

Evidence (2026-07-29): focused Vitest coverage injects a staged-write failure,
then verifies the prior complete installation and confirms that staging state
was removed. `npm run test:proof` passed locally. GitHub Actions
[`verify` run 30472562682](https://github.com/mortenbroesby/agent-distro/actions/runs/30472562682)
passed `npm ci`, `npm test`, and `npm run test:proof` on macOS and native
Windows.

## Story 2 — Commit and rollback

**Status:** Done

### Tasks

- [x] Record whether each destination existed and preserve its old bytes before
      replacement.
- [x] Replace staged files, then remove staging state only after success.
- [x] Roll back newly created files and restore replaced files after a rename
      or permission failure.
- [x] Add a focused injected-failure test that verifies `verify` still reports
      the previous complete installation.

Acceptance: an ordinary filesystem failure leaves either the old complete
installation or the new complete installation, never a mix.

Evidence (2026-07-29): focused Vitest coverage injects a failure into the
second staged rename after the first replacement succeeds. It then verifies
the original one-asset installation and confirms that the newly staged asset
and staging directory are absent. `npm run test:proof` passed locally. GitHub
Actions [`verify` run 30473532523](https://github.com/mortenbroesby/agent-distro/actions/runs/30473532523)
passed `npm ci`, `npm test`, and `npm run test:proof` on macOS and native
Windows.

## Story 3 — Explicit recovery command

**Status:** Done

### Tasks

- [x] Persist the smallest transaction journal needed to recover an interrupted
      commit.
- [x] Add `agent-distro recover <target>` with the existing stderr-code/recovery
      contract.
- [x] Refuse a new install while an incomplete transaction is present and point
      to `recover`.
- [x] Test recovery from a deliberately retained journal without reading asset
      contents into diagnostics.

Acceptance: after process interruption, `recover` deterministically restores
the previous complete state or reports that no recovery is needed.

Evidence (2026-07-29): focused Vitest coverage creates a retained journal with
a replaced manifest and newly created prompt, proves `install` refuses it,
then proves `recover` restores the prior verified installation and leaves its
partial asset absent. Diagnostics never emits the retained asset content.
GitHub Actions [`verify` run 30474351788](https://github.com/mortenbroesby/agent-distro/actions/runs/30474351788)
passed `npm ci`, `npm test`, and `npm run test:proof` on macOS and native
Windows.

## Story 4 — Hostile-path proof

**Status:** Ready

### Tasks

- [ ] Cover a blocked write and a rename failure through the filesystem seam.
- [ ] Cover an existing install, an empty target, and a partial-target conflict.
- [ ] Exercise the packaged command in the existing macOS and Windows GitHub
      Actions matrix.
- [ ] Record completed hosted run URLs and only check acceptance boxes with
      evidence.

Acceptance: the packaged command proves the recovery behavior on macOS and
native Windows without requiring Bash.

## Completion

Move this epic to `../done/` only after all stories have direct test evidence
and both hosted package jobs pass.
