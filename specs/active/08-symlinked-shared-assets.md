# Symlinked shared distribution assets

**Status:** Active

**Priority:** 1

**Goal:** Establish `assets/` as the one canonical curated-content tree for
custom installation, the Copilot marketplace plugin, and future APM packaging.

## Decision

Git tracks relative symbolic links in `plugins/agent-distro/` to the matching
files under `assets/`. Plugin and marketplace manifests remain plugin-specific
metadata, not content copies. The generator recreates and verifies these links
so a checkout cannot silently retain an old copied plugin asset. Copilot plugin
components are the shared agents, skills, hook template, and MCP template; the
custom-install-only instruction asset is deliberately not duplicated as a
plugin component.

## Story 1 — Canonical shared asset topology

**Status:** Done

### Tasks

- [x] Replace copied plugin agents, skills, hook, and MCP files with relative
  Git symbolic links to `assets/`.
- [x] Retain manifests as the only plugin-specific files.
- [x] Give shared skills Agent Distro-prefixed identities to avoid Copilot
  first-found-wins collisions.

Acceptance: changing one curated component updates the custom installer and
marketplace plugin through exactly one tracked asset file.

## Story 2 — Generator and regression contract

**Status:** Done

### Tasks

- [x] Generate and check exact relative symlink targets.
- [x] Remove obsolete generated plugin copies.
- [x] Test symlink mode, target, and readable shared content.

Acceptance: a stale copied plugin component fails the generated-output check.

## Story 3 — Cross-platform proof and APM boundary

**Status:** Active

### Tasks

- [ ] Prove generator, package tests, and real Copilot marketplace installation
  on macOS and Windows Git Bash.
- [x] Record `assets/` as the future APM input; do not add an APM package or
  publication flow yet.
- [ ] Move this epic to `../done/` only with direct and hosted evidence.

Acceptance: Git checkout and generated links work on both supported platforms,
and later distribution targets have one content source to consume.

## Story 4 — Commit-time formatting guard

**Status:** Active

### Tasks

- [x] Install a tracked Git hook path through the existing npm `prepare` step.
- [ ] Format and restage only the files selected for a commit on macOS and
  Windows Git Bash.

Acceptance: a developer commit cannot reintroduce an Oxfmt-only CI failure for
its staged supported source files.
