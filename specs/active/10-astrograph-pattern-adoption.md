# Astrograph pattern adoption

**Status:** Active

**Priority:** 0

**Goal:** Reuse the small, proven delivery patterns from Astrograph that make
Agent Distro safer to maintain and install, without importing its MCP product,
release machinery, or repository-specific automation.

## Evidence boundary

This assessment compares Agent Distro with Astrograph `origin/main` as
inspected on 2026-07-30. Astrograph is a published MCP and indexing product;
Agent Distro is a deliberately unpublished, Node-only asset installer. Reuse
only applies where the user-facing boundary is shared: a packed Node CLI,
cross-platform installation, and concurrent agent maintenance.

## Decision

Adopt a small contributor-surface contract and retain the existing packed npm
consumer proof as the installation contract. Do not recreate Astrograph's
release agent, MCP configuration, code-indexing runtime, hook harness, vault,
or Windows PowerShell workflow. Those solve product requirements Agent Distro
does not have, and publishing remains intentionally deferred.

## Story 1 — Contributor agent-surface contract

**Status:** Done

### Tasks

- [x] Compare Astrograph's `agents:check` pattern with Agent Distro's local
  contributor skills and thin `AGENTS.md` agreement.
- [x] Add a dependency-free `agents:check` command for the local skill catalog,
  its two documentation surfaces, retained licenses, and package boundary.
- [x] Add a focused regression test for the command.

Acceptance: a deleted, undocumented, unlicensed, or accidentally packaged
contributor skill fails before merge.

## Story 2 — Keep the package proof narrow and real

**Status:** Done

### Tasks

- [x] Compare Astrograph's tarball-install smoke with the current packed npm
  consumer and runtime-matrix tests.
- [x] Confirm Agent Distro already packs once, installs into a clean consumer,
  invokes the public binary, and exercises plain, Git, monorepo, conflict, and
  space/Unicode-path targets.
- [x] Retain Node standard-library process execution and bounded Windows-safe
  temporary-directory cleanup instead of adding a fixture or shell library.

Acceptance: every supported runtime still executes the exact packed artifact
on macOS and Windows Git Bash; no source-tree-only proof is treated as release
evidence.

## Story 3 — Reassess only after a real scope trigger

**Status:** Ready

### Tasks

- [ ] Consider a small installer "doctor" addition only when diagnostics can
  identify an actionable missing prerequisite beyond the current `diagnostics`
  command and opt-in issue URL.
- [ ] Consider a package-file-list assertion only if the explicit npm `files`
  boundary stops being sufficient evidence.
- [ ] Reassess release/version automation only if the deferred publishing
  decision changes.

Acceptance: any future adoption has a concrete user failure or distribution
requirement, plus a focused cross-platform proof.

## Explicit non-adoptions

- Astrograph MCP configuration, indexing/parser/runtime dependencies, cache,
  daemon, and global storage: different product.
- Trusted npm publishing, version-bump policy, tags, release agent, and retry
  workflow: Agent Distro is not planning to publish.
- Harness-specific `.codex` hooks, broad command blocks, and vault enforcement:
  the current `AGENTS.md`, worktree, PR, and hosted-check policy already own
  this repository's collaboration boundary.
- PowerShell-specific helpers: supported Windows execution is Git Bash plus
  Node/npm, and the existing CI exercises that path.

## Evidence

- `npm run agents:check` verifies the contributor agent surface.
- `test/package.test.mjs` performs a packed npm consumer install against real
  target shapes; `test/runtime-package.mjs` repeats the public-binary proof on
  each declared Node runtime.
- Hosted macOS and Windows PR checks remain the integration gate before this
  epic can be moved to `../done/`.
