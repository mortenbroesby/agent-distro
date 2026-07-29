# Reliable runtime and observable installation

**Status:** Active

**Priority:** 0

**Goal:** Keep Agent Distro a small Node CLI whose packaged installer is
reliable, explainable, and intentionally compatible across supported Node
runtimes on macOS and Windows.

## Compatibility decision

The published CLI supports Node `>=20.12.0 <27`. This is the widest range
supported by every runtime dependency: Commander requires Node 20, Clack
requires Node 20.12, and Execa requires Node 20.5. Development builds remain
on Node 22.18+ because Tsdown requires it. CI must therefore build one package
on Node 22, then install and exercise that exact tarball on Node 20, 22, 24,
and 26 for both supported operating systems.

The Node 20 lane is a compatibility proof, not a recommendation to deploy an
end-of-life runtime. The range will be revised when a dependency or Node
support policy makes it unsafe to retain.

## Story 1 — Deliberate runtime compatibility

**Status:** Active

### Tasks

- [ ] Declare the supported runtime range and compile distributable code for
  its lowest supported Node version.
- [ ] Produce one packed artifact using the supported build runtime.
- [ ] Install and run that same artifact on Node 20, 22, 24, and 26 on macOS
  and Windows Git Bash.
- [ ] Keep build-only tooling out of the runtime compatibility claim.

Acceptance: every declared runtime executes the packed npm binary through a
real install, while build tooling has its own explicit supported floor.

## Story 2 — Observable transactional installation

**Status:** Active

### Tasks

- [ ] Add an opt-in concise verbose phase stream for validation, staging,
  apply, rollback, and finalization.
- [ ] Keep normal command output compact and failure output sanitized.
- [ ] Cover a successful install and a rollback path with stable verbose
  messages.

Acceptance: an operator can identify the last completed installation phase
without exposing file contents, credentials, or unrelated local paths.

## Story 3 — Maintainable public contracts

**Status:** Active

### Tasks

- [ ] Replace broad installer callback/options shapes with documented exported
  types at the public boundary.
- [ ] Audit changed runtime and support modules for file intent, TSDoc on
  exported APIs, and comments at non-obvious filesystem or platform seams.
- [ ] Retain small standard-library helpers instead of adding a logging,
  validation, or runtime-transpilation dependency.

Acceptance: a maintainer can understand public inputs, outputs, side effects,
and safety guarantees without reverse-engineering the installer body.

## Story 4 — Evidence and closeout

**Status:** Active

### Tasks

- [ ] Run focused local formatting, lint, package, runtime, and installation
  regression checks.
- [ ] Verify completed hosted macOS and Windows checks for the exact PR head.
- [ ] Move this epic to `../done/` only when every acceptance criterion has
  direct evidence.

Acceptance: support, observability, and maintainability claims are backed by
the exact packaged workflow users run.
