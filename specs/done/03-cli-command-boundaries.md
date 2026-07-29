# CLI command boundaries

**Status:** Done

**Priority:** 1

**Goal:** Keep Agent Distro's command surface small and make each supported
interaction own its implementation without changing the packaged CLI contract.

## Command decision

The supported commands are `install`, `recover`, `verify`, `diagnostics`, and
`report-issue`. Help and version remain Commander behavior. `update` is not a
command: Agent Distro has no remote release source or independent update
operation; rerunning `install` is the explicit replacement path.

## Story 1 — Define the boundaries

**Status:** Done

### Tasks

- [x] Inventory the public commands and retain only independently meaningful interactions.
- [x] Decline `update` because it duplicates explicit install replacement semantics.
- [x] Keep `recover` with installation because it completes an interrupted install transaction.
- [x] Keep `verify` and `diagnostics` together as read-only doctor behavior.

Acceptance: every command has one clear user purpose; no speculative command is added.

## Story 2 — Separate implementation by interaction

**Status:** Done

### Tasks

- [x] Add `src/agent-distro.ts` as the package entrypoint.
- [x] Keep Commander registration in `src/cli.ts` only.
- [x] Move install, interactive selection, and recovery into `src/install.ts`.
- [x] Move verification and diagnostics into `src/doctor.ts`.
- [x] Move opt-in issue reporting into `src/report-issue.ts`.
- [x] Keep shared sanitization and failure formatting in the minimal `src/errors.ts` seam.

Acceptance: changing one interaction does not require editing the root entrypoint or unrelated command implementation.

## Story 3 — Preserve the packaged contract

**Status:** Done

### Tasks

- [x] Build the new root entrypoint and confirm the bin still invokes it.
- [x] Run the existing behavior and packaged-install proofs.
- [x] Record completed macOS and Windows hosted verification on the pull request.

Acceptance: the public commands, output contracts, and packed npm binary remain unchanged.

Evidence (2026-07-29): `npm test` passed 21 tests, including the packed npm
consumer test; `npm run test:proof` passed the direct install, verification,
conflict, force, and dry-run proof through `bin/agent-distro.mjs`. PR #11
passed macOS and Windows in Actions runs `30476256120` and `30476292131`.
