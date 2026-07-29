# Opt-in issue-report handoff

**Status:** Done

**Priority:** 1

**Parent:** [Reliable installation and diagnostics](./00-reliable-installation-and-diagnostics.md), Story 2

**Goal:** Give a user a useful, privacy-preserving way to open an Agent Distro issue
after a failure, without network activity, browser control, or hidden data
collection.

## Guardrails

- The command prints a URL only; it never opens a browser or creates an issue.
- The URL contains version, Node version, platform/architecture, action, error
  code, and a sanitized user summary—never target paths, asset contents, or
  environment variables.
- Consent is explicit on every invocation.

## Story 1 — Local sanitized issue URL

**Status:** Done

Build one small, exported URL encoder backed by Node's `URLSearchParams`.

### Tasks

- [x] Define the fixed public issue endpoint and minimal diagnostic fields.
- [x] Reuse the existing sanitizer for summary, action, and error-code fields.
- [x] Generate a review-before-submit title and body with no network operation.
- [x] Test POSIX path, Windows path, and token redaction in the decoded URL.

Evidence (2026-07-29): `npm test` passed 15 tests. The URL encoder is local
and only uses Node's `URLSearchParams`; its decoded test body contains
redactions for token, POSIX, and Windows-path inputs.

Acceptance: a deterministic URL can be generated directly in a test and
contains no unredacted sensitive input.

## Story 2 — Explicit CLI consent boundary

**Status:** Done

Expose the encoder through `agent-distro report-issue`.

### Tasks

- [x] Add a `report-issue` Commander command with required `--message`.
- [x] Require `--diagnostics-consent`; reject omission with the standard usage
      failure contract.
- [x] Support optional `--action` and `--code` metadata with safe defaults.
- [x] Test that successful output is only one URL and has no filesystem writes.

Evidence (2026-07-29): `npm test` runs the command from an empty temporary
directory and asserts its directory entries are unchanged.

Acceptance: invoking the command has no side effects beyond writing the URL to
stdout.

## Story 3 — Failure-to-report guidance

**Status:** Done

Make unexpected failures tell users how to generate a report without copying
raw diagnostics into a shell command.

### Tasks

- [x] Add a concise, generic next-step command to unexpected-failure guidance.
- [x] Ensure the suggestion does not interpolate untrusted error text or paths.
- [x] Test unexpected-error output contains only sanitized text and guidance.

Acceptance: a user can discover reporting from an unexpected failure without
Agent Distro ever preparing a command containing sensitive data.

## Story 4 — Packaged and cross-platform proof

**Status:** Done

Prove the report command from a packed package on macOS and native Windows.

### Tasks

- [x] Add packed-package `report-issue` coverage to the existing npm proof.
- [x] Assert the Windows `.cmd` shim and macOS executable produce the same
      required decoded URL fields and redactions.
- [x] Record a completed hosted macOS/Windows Actions run in this epic.

Evidence (2026-07-29): GitHub Actions [`verify` run
30475273988](https://github.com/mortenbroesby/agent-distro/actions/runs/30475273988)
passed `npm ci`, `npm test`, and `npm run test:proof` on macOS and native
Windows. The packed proof invokes `report-issue`, decodes the returned URL,
checks redaction and metadata, and confirms no files were written.

Acceptance: real installed-package proof covers the non-mutating report path
on both supported operating systems.

## Completion

Move this file to `../done/` only when all story and task checkboxes have
evidence. Update the parent epic and [progress tracker](../roadmap/progress.md)
at the same time.
