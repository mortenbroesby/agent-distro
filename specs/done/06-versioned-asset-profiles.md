# Versioned asset profiles

**Status:** Done

**Priority:** 1

**Goal:** Let users install small, intentional groups of Agent Distro assets,
or individual assets, with no default selection and a versioned catalog that
describes exactly what was installed.

## Research decision

Use a small base instruction set plus task-loaded skills, narrow custom agents,
and optional deterministic hooks. GitHub recommends skills for detailed,
task-relevant workflows rather than broad instructions; custom agents isolate
specialist context; hooks are suited to lifecycle automation and guardrails.

- [GitHub: skills versus instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
- [GitHub: custom agents and subagents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)
- [GitHub: hooks](https://docs.github.com/en/copilot/concepts/agents/hooks)

The initial profiles are foundation, pull-request-review, debugging, handoff,
and hook-template. No profile is preselected. Update remains unnecessary: an
explicit install against a newer packaged catalog is the versioned replacement
operation.

## Story 1 — Catalog contract

**Status:** Done

### Tasks

- [x] Add a versioned catalog that owns assets, labels, and profile membership.
- [x] Validate catalog paths, unique assets, and profile references at load time.
- [x] Record the catalog version in every installed manifest.
- [x] Treat a missing or malformed catalog version as an invalid manifest.

Acceptance: catalog edits are normal version-controlled package changes and an
installation records the catalog contract it used.

Follow-up (2026-07-29): profiles.json is the versioned source of truth.
scripts/generate-catalog.mjs deterministically generates catalog.json; build
refreshes it and catalog:check rejects a stale committed artifact.

## Story 2 — Composable selection

**Status:** Done

### Tasks

- [x] Add install --profile without removing --asset.
- [x] Let profiles and individual assets compose; reject unknown names.
- [x] Make --all derive from the catalog and reject mixing it with selections.
- [x] Add profiles for machine-readable discovery.
- [x] Keep the TUI empty by default and offer profile selection before individual assets.

Acceptance: a user can select one workflow group, add one asset, or make no
change; scripts can discover and select profiles deterministically.

## Story 3 — Useful initial workflows

**Status:** Done

### Tasks

- [x] Add pull-request review agent, skill, and prompt.
- [x] Add debugging agent, skill, and prompt.
- [x] Add handoff agent, skill, and grill-me prompt.
- [x] Keep a hook as an explicit optional template instead of silently enabling automation.

Acceptance: each initial profile maps to one development workflow and does not
imply unrelated installation.

## Story 4 — Packaged cross-platform proof

**Status:** Done

### Tasks

- [x] Cover profile discovery, composition, catalog manifest version, and unknown profiles locally.
- [x] Run the packed npm consumer test and direct package proof locally.
- [x] Record a completed macOS and Windows PR run for the catalog profile flow.

Acceptance: the installed npm package provides the same catalog behavior on
macOS and native Windows.

Evidence (2026-07-29): PR #14 run 30481132444 passed the packaged catalog
profile flow on macOS and native Windows.
