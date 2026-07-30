# Agent Distro and ASDLC porting map

**Snapshot:** 2026-07-30  
**Agent Distro baseline:** `origin/main` at `71dcad0`  
**ASDLC comparison source:** `/Users/macbook/personal/external/f1it-asdlc`,
`asdlc-rewrite` at `d6396ee`

## Existing inventory

The fuller historical inventory is already present, locally and untracked, in
both repositories as `.memory/01-inventory-and-compatibility-contract.md`.
This file is the durable comparison and porting record for the current Agent
Distro baseline; refresh the two revisions above before using it for a change.

## Current comparison

| Area | Agent Distro | ASDLC snapshot |
| --- | --- | --- |
| Runtime | Node ESM, tsdown, Node 20.12–26 | Node ESM, tsdown, Node 22.12+ |
| CLI | `install`, `verify`, `recover`, `diagnostics`, `report-issue`, `profiles` | `install`, `verify` |
| Asset model | 16 versioned assets in 9 composable profiles; interactive or explicit selection | Six fixed fixture assets, installed together |
| Managed state | `.agent-distro/manifest.json` plus a recovery journal | `.asdlc/manifest.json` |
| Safe writes | Plan-before-write, staged replacements, rollback/recovery, explicit `--force` | Plan-before-write, conflict abort, explicit `--force` |
| Validation | Hash verification, safe diagnostics, packaged/repository smoke tests | Hash verification and basic package/proof tests |
| Development tooling | Curated repository-local skills, Git hooks, Copilot plugin | None in the tracked snapshot |

Both tools install the same Copilot-facing categories: agents, hooks,
instructions, prompts, skills, and MCP configuration. Both reject traversal
and symlinked managed paths, support `--dry-run`, refuse changed files without
`--force`, and record file hashes.

## Port-back contract

Treat ASDLC's `.asdlc/manifest.json` as its public ownership boundary. Do not
point both installers at the same target, rename its metadata in place, or
make Agent Distro's catalog the source of truth without an explicit migration.

Port in this order, with a focused behavior test at each step:

1. Add ASDLC selection metadata only after deciding its stack/category model;
   preserve a no-selection install that keeps the six-file contract.
2. Add Agent Distro's staged write and recovery journal under `.asdlc/` so an
   interrupted replacement can be restored without global state.
3. Add read-only diagnostics and a packaged-install smoke test only when the
   ASDLC package is again a supported distribution path.
4. Curate production assets separately from the installer: every asset needs
   an owner, target surface, supported platforms, and MCP auth/data notes.

Do not port Agent Distro's CLI names, `.agent-distro` manifest format,
repository-only `.agents` skills, or profile definitions by default. Those
are Agent Distro-specific policy, not shared installer requirements.

## Refresh procedure

Before a future port, compare the two current trees rather than this snapshot:

```sh
git -C /path/to/agent-distro rev-parse origin/main
git -C /path/to/f1it-asdlc rev-parse HEAD
git -C /path/to/f1it-asdlc ls-files
```

Then update this file with the revisions, the selected behavior to port, and
the corresponding ASDLC compatibility test.
