# Copilot plugin marketplace offering

**Status:** Done

**Priority:** 1

**Goal:** Let GitHub Copilot CLI users install Agent Distro's curated workflow
components from this repository through a first-class marketplace.

## Decision

Follow Obra Superpowers' marketplace shape: keep a marketplace manifest in the
repository and list one named plugin from a relative subdirectory. Generate
that plugin from `assets/profiles.json`, the existing content source, rather
than maintaining a second hand-copied catalog. The plugin contains uniquely
prefixed agents and skills, plus deliberately empty MCP and hook templates; it
does not execute a shell installer or add a publishing workflow.

## Story 1 — Marketplace and plugin contract

**Status:** Done

### Tasks

- [x] Add `.github/plugin/marketplace.json` with one strict `agent-distro`
  entry sourced from this repository.
- [x] Add `plugins/agent-distro/plugin.json` and component directories using
  Copilot's default plugin conventions.
- [x] Prefix component identifiers to avoid silently colliding with user or
  project Copilot components.

Acceptance: Copilot CLI can discover a named marketplace and resolve a
same-repository plugin directory.

## Story 2 — Content and drift prevention

**Status:** Done

### Tasks

- [x] Generate agents and skills from the existing profile source.
- [x] Include a foundation skill and optional empty MCP and hook templates.
- [x] Add a manifest/component test and make the generator reject stale output.

Acceptance: CLI installation and plugin installation distribute the same
curated concepts without duplicate hand-maintained content.

## Story 3 — Real CLI proof and closeout

**Status:** Done

### Tasks

- [x] Run local Copilot CLI marketplace add, browse, install, and list against
  the repository path when the CLI is available.
- [x] Add the same real-client smoke flow to the macOS and Windows Git Bash
  verification workflow.
- [x] Run completed macOS and Windows Git Bash verification for the exact PR
  head.
- [x] Move this epic to `../done/` only after direct or hosted evidence exists.

Acceptance: users have an install command that works from this repository on
the supported platforms.

Evidence: GitHub Actions [verify run 30487038245](https://github.com/mortenbroesby/agent-distro/actions/runs/30487038245)
passed `npm ci`, `npm test`, `npm run test:proof`, and the real Copilot CLI
marketplace add, browse, install, and list sequence on macOS and Windows Git
Bash for PR #24's exact rebased head.
