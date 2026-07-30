# ASDLC parity and migration brief

This is the committed record of the parity discussion between Agent Distro and
the richer ASDLC source snapshot. It resolves product decisions before moving
Agent Distro foundations into the ASDLC codebase.

## Goal

Create an ASDLC integration branch for a later stacked pull-request sequence.
ASDLC remains the public product. Agent Distro supplies proven installer,
packaging, TUI, catalog, and safety patterns; it is not a rename target or a
separate competing CLI.

## Current comparison

| Area | Agent Distro today | ASDLC migration target |
| --- | --- | --- |
| Public command | `agent-distro` | `asdlc` |
| Selection | Global profiles and assets | Stack-first profiles and assets |
| Target state | `.agent-distro/` | `.asdlc/` |
| Mutation safety | Transaction and recovery journal | Transaction plus archive-on-deselection/conflict |
| Runtime | Packed global CLI from a checkout | Managed copy at `~/.asdlc/repo`, then packed global CLI |
| Diagnostics | Target doctor and JSON diagnostics | One doctor report for global and target state, with JSON |

The rich reference is `f1it-asdlc-main`; it is a source snapshot rather than
a Git checkout. The archived `f1it-asdlc` rewrite is not the feature baseline.

## 1. Public identity

**Decision:** The public product and command remain **ASDLC** and `asdlc`.

**Implication:** Agent Distro is a source of implementation and product
patterns, not a public rename target. Migration work preserves the ASDLC name
and command contract unless a later decision explicitly changes a command.

## 2. Target-local state

**Decision:** Keep `.asdlc/` as the target repository's management area. It
may contain an archive and future state needed to manage an installation.

**Implication:** The current manifest and `managed-files.txt` formats are not
fixed contracts. New state may be versioned and migrated. Compatibility with
an existing installation is a deliberate legacy-support path, rather than a
reason to retain the current implementation unchanged.

## 3. Command meanings

**Decision:** `asdlc install` and `asdlc update` both change selected assets
in a target repository. `install` warns when the target already has ASDLC
state. `asdlc upgrade` updates the globally installed ASDLC CLI itself.

**Implication:** `update` is never used for the CLI. The target mutation path
can share one implementation; the distinct commands communicate first-time
installation versus an existing managed target. The exact selection behavior
of `update` is prefilled from recorded target state, so the user can keep or
adjust it intentionally.

## 4. Deselected assets

**Decision:** When an installation or update deselects an ASDLC-managed asset,
move it to `.asdlc/.archive/` rather than deleting it.

**Implication:** Maintain a Markdown archive record inside `.asdlc/` for user
inspection and report archived assets during installation or update. Archive
retention and restoration behavior remain to be defined.

## 5. New-install defaults

**Decision:** A new `asdlc install` starts with no assets selected.

**Implication:** ASDLC is opt-in by default. Profiles, categories, stacks, and
individual assets are explicit user choices rather than implicit baseline
installation.

## 6. Stack-first selection

**Decision:** Installation starts by selecting stacks. ASDLC then presents only
assets available to each selected stack; for every stack, users select profiles
and customize the eligible assets.

**Implication:** Stack membership is first-class catalog metadata and should be
reflected in the source layout. Profiles and individual asset choices are
scoped per stack, rather than being one global selection. The treatment of
cross-stack assets uses an explicit Common stack.

## 7. Shared assets

**Decision:** Shared assets belong to a separately selectable **Common** stack.

**Implication:** Common is not installed implicitly. Its profiles and assets
follow the same explicit selection model as technology-specific stacks.

## 8. Shared target paths

**Decision:** Merge compatible contributions from selected stacks that target
the same managed path. A true content conflict stops the operation.

**Implication:** The catalog needs explicit merge behavior for any asset type
that can share a target path. ASDLC must not silently choose one stack's
content over another's.

## 9. Conflict recovery

**Decision:** In the interactive flow, an unmergeable conflict offers the
user a provider choice before any write. `--force` permits installation or
update to replace conflicting content, first moving the displaced content to
`.asdlc/.archive/`. Fatal errors always provide an opt-in bug-report path.

**Implication:** Conflict resolution, archive entries, and failure reporting
must remain transactional. Non-interactive conflict behavior remains to be
defined; it cannot wait for a prompt.

## 10. Non-interactive conflicts

**Decision:** A non-interactive unmergeable conflict fails unless `--force` is
supplied. Its user-facing message explains the force option and provides the
opt-in bug-report path.

**Implication:** Scripts never receive an automatic provider choice. `--force`
uses the same archive-before-replacement behavior as the interactive flow.

## 11. CLI upgrade source

**Decision:** For now, `asdlc upgrade` updates a locally cloned ASDLC checkout,
then repacks and reinstalls the global CLI.

**Implication:** Npm publication is deferred. Upgrade must make the checkout
location and any Git/update failure visible to the user.

## 12. Managed checkout location

**Decision:** Retain `asdlc bootstrap`. It creates the managed runtime copy at
`~/.asdlc/repo` by default and lets the user opt into choosing another
location.

**Implication:** The existing bootstrap implementation will be replaced by the
new Node-based flow. `asdlc upgrade` uses the selected checkout location.

## 13. First installation

**Decision:** First-time users clone ASDLC, enter that source checkout, and
run `bin/asdlc bootstrap`. Bootstrap creates the managed runtime copy from
that checkout; it does not independently discover or download a source.

**Implication:** Reuse the Node packed-artifact bootstrap pattern for the
managed runtime: package it, install the global CLI, and prove it. The
managed-copy model remains the default; shell integration is a separate
implementation choice.

## 14. Doctor scope

**Decision:** `asdlc doctor` always reports global CLI and managed-runtime
state. When run inside, or explicitly pointed at, a repository, it separately
reports the repository's `.asdlc/` state.

**Implication:** Global and target diagnostics are equal first-class sections
of one doctor report. The report must make it clear when the current directory
is not an ASDLC-managed repository, but that condition still exits
successfully.

## 15. Programmatic doctor

**Decision:** `asdlc doctor --json` emits a stable, path-safe machine-readable
report alongside the normal human-readable doctor output.

**Implication:** The JSON contract is read-only and safe for scripts and CI;
it must not expose repository contents, secrets, or absolute paths.

## Required Agent Distro adaptations

1. Keep the proven Node/Commander/Clack structure, but expose it as `asdlc`
   and write target state under `.asdlc/`.
2. Replace the global profile model with a stack-first catalog: Common and
   technology stacks each own profiles and eligible assets.
3. Add target-state migration, prefilled `update`, archive records, compatible
   target-path merges, interactive conflict choice, and force-with-archive.
4. Replace the bootstrap contract with the managed-copy model at
   `~/.asdlc/repo`, while retaining the packed global artifact proof.
5. Extend doctor into global plus target sections and preserve a path-safe JSON
   interface.
6. Carry forward transactional filesystem safety, recovery, package smoke
   tests, cross-platform verification, and the opt-in TUI.

## Questions intentionally still open

1. What exit status should doctor use when global or target checks find actual
   damage, as distinct from an unmanaged current directory?
2. Which concrete profiles exist for Common and each technology stack, and
   which existing ASDLC assets survive the catalog curation?
3. What source-folder and catalog metadata layout best expresses stack,
   profile, category, target path, and merge behavior without duplication?
4. Which target-path formats are mergeable, and what is each format's explicit
   merge rule?
5. How long are `.asdlc/.archive/` entries retained, and what restoration
   command or workflow—if any—is required?
6. Which legacy `.asdlc` manifests and managed-file records must migrate, and
   what happens when their source selection cannot be reconstructed?
7. Which final commands are retained beyond `bootstrap`, `install`, `update`,
   `upgrade`, and `doctor`—especially recovery, profile listing, validation,
   and issue reporting?
8. Should shell PATH integration remain part of bootstrap, or should the
   package manager's global bin location be the only supported launcher path?
9. What Git remote and base branch will host the ASDLC integration stack, given
   that `f1it-asdlc-main` is currently only a source snapshot?

## Delivery boundary

Do not begin the ASDLC implementation until the open questions needed by its
first slice are settled and the intended ASDLC Git base is available. This
brief is updated and committed whenever a decision changes.
