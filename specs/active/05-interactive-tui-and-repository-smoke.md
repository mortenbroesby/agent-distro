# Interactive TUI and real-repository smoke

**Status:** Done

**Priority:** 0.1

**Goal:** Refactor the interactive installation journey into a clear,
production-quality TUI and prove it against disposable, real filesystem and
Git repository shapes.

## Fixture decision

Use Vitest's built-in `test.extend` fixtures, Node `fs.mkdtemp`/`fs.rm`, and
the existing `execa` dependency. Each fixture creates a real directory and,
when requested, invokes the real `git` executable; cleanup is registered with
Vitest. Do not add a fixture or temporary-directory package unless this cannot
express a required repository shape. In-memory filesystems are out of scope:
the proof must exercise native paths, permissions, npm launchers, and Git.

## Story 1 — Reusable repository fixtures

**Status:** Done

### Tasks

- [x] Create a Vitest repository fixture with automatic cleanup.
- [x] Provide named shapes: plain directory, Git repository, monorepo, and conflict target.
- [x] Initialize Git through `execa`, with local test identity and no network remote.
- [x] Make fixture paths safe for spaces and Unicode on every platform.

Acceptance: tests can request an isolated real repository shape without
copy-pasting setup or teardown.

## Story 2 — Packaged real-world smoke matrix

**Status:** Active

### Tasks

- [ ] Pack and install Agent Distro into a disposable npm consumer once per smoke run.
- [ ] Prove install and verify in a plain directory and a Git repository.
- [ ] Prove root and nested-package targeting in a monorepo.
- [ ] Prove a conflicting managed file fails safely and `--force` recovers only the target.
- [ ] Preserve missing-target, spaces, Unicode, and native Windows `.cmd` coverage.

Acceptance: a packed consumer exercises the same installer path a user runs,
across representative repository shapes.

## Story 3 — TUI journey refactor

**Status:** Ready

### Tasks

- [x] Keep Commander as the non-interactive command contract and `@clack/prompts` as the TTY implementation.
- [x] Refactor the wizard into explicit target, asset-selection, confirmation, progress, success, and cancellation states.
- [x] Keep the selection empty by default and preserve `--asset`/`--all` automation.
- [x] Make non-TTY invocation fail safely with a direct automated alternative.

Acceptance: an interactive user can understand what will change before any
write, while scripts retain stable non-interactive behavior.

Evidence: focused tests exercise the Clack adapter seam through target,
selection, confirmation, progress, success, and cancellation without a fake
terminal; the existing non-TTY test preserves the automated alternative.

## Story 4 — TUI and smoke evidence

**Status:** Ready

### Tasks

- [ ] Add focused state/adapter tests without emulating a terminal in memory.
- [ ] Exercise the selected assets against a real repository fixture.
- [ ] Run the packaged fixture matrix on macOS and Windows Git Bash.
- [ ] Record the manual TTY smoke command for human terminal validation.

Acceptance: TUI logic is tested at its seam and installation results are
proved in real disposable repositories on both platforms.

## Story 5 — Completion

**Status:** Ready

### Tasks

- [ ] Update the decision record if a new dependency becomes necessary.
- [ ] Check every task only with direct or hosted evidence.
- [ ] Move this epic to `../done/` after the exact PR head passes both platforms.

Acceptance: the TUI and smoke harness are maintainable without a custom test
framework or a second installer.
