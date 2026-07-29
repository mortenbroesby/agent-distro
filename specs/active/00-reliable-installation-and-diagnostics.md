# Reliable installation and diagnostics

**Status:** Active

**Priority:** 0

**Goal:** ASDLC must never silently fail. Every anticipated failure is shown as
a safe, actionable diagnostic; unexpected failures are reportable without
automatically sharing user data.

## Product boundary

ASDLC remains a Node-only, Git-Bash-compatible installer for GitHub Copilot
assets. It is not an APM clone, package registry, or policy engine.

The design borrows only the [APM](https://github.com/microsoft/apm) patterns that reduce operator uncertainty:
explicit target selection, dry-run, reproducible state, and a clear failure
when no target can be used. APM's dependency resolver, registry, content cache,
lockfile, target matrix, policy engine, and multi-client deployment are out of
scope until ASDLC needs them. APM documents `apm.yml` plus `apm.lock.yaml`,
explicit targets, dry-run, and a non-zero exit when no target is detected;
those are reference patterns, not requirements for this minimal installer.

## Global invariants

- A non-zero exit always writes a concise reason and a next action to stderr.
- Normal output never contains tokens, credentials, home directories, or full
  local paths unless the user explicitly requests local diagnostics later.
- No failure may write a partial managed asset set.
- Automated use stays non-interactive and machine-readable: scripts choose
  assets with `--asset` or `--all`; the TTY wizard starts with no selection.
- A report link is generated locally and never opens a browser or submits an
  issue automatically.

## Story 1 — Failure contract and safe diagnostics

**Status:** Active

Create one error boundary for the CLI. It must classify expected invalid input,
unsafe destination state, and unexpected I/O/runtime faults; show an error code,
safe summary, and recovery command; and preserve the existing non-zero exits.

Acceptance criteria:

- [x] Every command failure writes a stable ASDLC code and a next step.
- [x] User-controlled paths and common credential forms are redacted from
      unexpected-error output.
- [x] `asdlc diagnostics <target>` emits a read-only JSON snapshot that never
      includes file contents or secrets.
- [x] Focused tests cover invalid target, conflict, malformed manifest, and an
      injected unexpected error.

Evidence (2026-07-29): `npm test` passed 14 tests, including the stable
stderr-code/recovery contract, redaction, and diagnostics snapshot. `npm run
test:proof` passed the packaged macOS proof.

## Story 2 — Opt-in issue-report handoff

**Status:** Active

Adopt Astrograph's useful pattern: a local function creates a pre-filled GitHub
issue URL from a sanitized failure summary and minimal runtime metadata. The
user must explicitly invoke it and review it before submission.

Implementation detail and task evidence live in the child
[opt-in issue-report handoff epic](./01-opt-in-issue-reporting.md).

Acceptance criteria:

- [ ] `asdlc report-issue --diagnostics-consent --message <summary>` prints a
      GitHub issue URL without network or browser activity.
- [ ] The URL body records ASDLC version, Node version, OS/architecture, action,
      error code, and redacted summary only.
- [ ] Tests prove token and POSIX/Windows-path redaction.

## Story 3 — Transactional install and recovery

**Status:** Active

Prove that interrupted, permission-denied, concurrent, and rename-failed writes
leave no partial managed state and provide a deterministic recovery command.

Implementation detail and task evidence live in the child
[transactional install and recovery epic](./02-transactional-install-and-recovery.md).

Acceptance criteria:

- [x] Stage all changed files before replacing any managed destination file.
- [ ] On failure, retain the previous complete state or remove only newly
      created staged files.
- [ ] Tests simulate write/rename failures and verify `verify` remains honest.

## Story 4 — Cross-platform hostile-path proof

**Status:** Ready

Extend real packaged smoke coverage to macOS and native Windows for spaces,
Unicode, read-only locations, Windows separators, symlinks, absent targets,
and npm `.cmd` invocation. The proof must be Node/npm based, not dependent on
a Bash file: npm gives Windows packages `.cmd` launchers, which the package
test asserts, then invokes through npm's own cross-platform executable runner.

Acceptance criteria:

- [x] Packaged npm install is tested on macOS and native Windows.
- [ ] Each tested platform covers install, dry-run, conflict, force, verify,
      and diagnostic failure output.
- [x] Windows results come from a completed hosted runner or user-supplied
      Windows evidence, not source-level inference. Git Bash smoke is a useful
      additional check, but native Windows npm-shim execution is authoritative.

Evidence (2026-07-29): GitHub Actions run `30468852345` passed `npm ci`,
`npm test`, and `npm run test:proof` on both `macos-latest` and
`windows-latest`. The Windows package test asserts `asdlc.cmd` exists after a
packed npm install and invokes ASDLC using `npm exec`.

## Story 5 — Deliberate dependency adoption

**Status:** Ready

Evaluate libraries only at real boundaries and record the selected seam.
Commander is retained for parsing and help; Execa is retained in the packaged
proof. `@clack/prompts` is retained only for the requested TTY wizard: its
empty-by-default multiselect selects individual shipped assets, while scripts
use Commander options. `zod` is deferred until a user-authored manifest/config
boundary exists. Do not add a runtime transpiler, custom registry, or an
APM-sized dependency graph.

Acceptance criteria:

- [ ] Every retained or added package has a named boundary and test.
- [ ] Node standard library remains the implementation for paths, hashing,
      filesystem writes, URL encoding, and environment data.
- [ ] The decision record explains why rejected modules do not yet exist in the
      runtime dependency graph.

## Verification and completion

Close this epic only after all five stories have direct tests or platform
evidence, `npm test`, `npm run test:proof`, and both hosted macOS and native
Windows package proofs pass. Move this file to `../done/` and update
`../roadmap/progress.md` and `../../pointer.md` at that time.
