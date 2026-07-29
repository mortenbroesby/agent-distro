# Source documentation standard

**Status:** Active

**Priority:** Side mission

**Goal:** Make Agent Distro's runtime behavior, safety boundaries, and proof
scenarios understandable directly from source, and require that clarity from
future agents.

## Story 1 — Durable collaboration rule

**Status:** Done

### Tasks

- [x] Require documentation in the agent-facing working agreement.
- [x] Define TSDoc coverage for exported runtime APIs.
- [x] Define intent-comment coverage for security, transaction, platform, and
  compatibility boundaries.

Acceptance: agents have a concrete, non-ceremonial rule for keeping source
documentation current.

## Story 2 — Runtime source audit

**Status:** Done

### Tasks

- [x] Document the role and exported contract of every `src/` module.
- [x] Explain the installer transaction, recovery, path-safety, diagnostics,
  and issue-reporting boundaries where they occur.
- [x] Preserve behavior; this mission changes documentation, not public CLI
  semantics.

Acceptance: a maintainer can follow each runtime module's responsibility and
non-obvious guarantees without reverse-engineering the implementation.

## Story 3 — Proof-source audit

**Status:** Done

### Tasks

- [x] Document the intent of the unit, packaged, proof, fixture, and
  repository-shape tests.
- [x] Explain why fixtures use real directories and Git rather than an
  in-memory substitute.

Acceptance: a maintainer can see which real-world scenario each proof layer
covers and why.

## Story 4 — Verification and closeout

**Status:** Active

### Tasks

- [x] Run focused tests and the standalone proof after documentation changes.
- [ ] Require completed macOS and Windows Git Bash verification for the exact
  pull-request head.
- [ ] Move this epic to `../done/` only after every task has direct evidence.

Acceptance: documentation is shipped through the same cross-platform process
as behavior changes.
