# Agent Distro foundation brief

This is the committed Q&A decision record from the parity discussion between
Agent Distro and the richer ASDLC source snapshot. It defines the complete
Agent Distro foundation; ASDLC remains a future porting target, not this
repository's implementation target.

## Goal

Make Agent Distro's installer, packaging, TUI, catalog, and safety behavior
complete and ready for a later port. That port should primarily rename the
product and replace Agent Distro's asset sets with ASDLC's curated assets.

## Target mapping

| Area | Required Agent Distro foundation | Future ASDLC port |
| --- | --- | --- |
| Public command | `agent-distro` | Rename to `asdlc` |
| Selection | Global profiles and assets | Stack-first profiles and assets |
| Target state | `.agent-distro/` | Rename to `.asdlc/` |
| Mutation safety | Transaction and recovery journal | Transaction plus archive-on-deselection/conflict |
| Runtime | Managed checkout and packed global CLI | Rename managed location |
| Diagnostics | One report for global and target state, with JSON | Preserve the behavior |

The rich reference is `f1it-asdlc-main`; it is a source snapshot rather than
a Git checkout. The archived `f1it-asdlc` rewrite is not the feature baseline.

## 1. Product identity

**Decision:** This repository remains **Agent Distro** and `agent-distro`.

**Implication:** A later ASDLC port renames the public command and local state,
but does not change the behavior being built here.

## 2. Target-local state

**Decision:** Keep `.agent-distro/` as the target repository's management area. It
may contain an archive and future state needed to manage an installation.

**Implication:** The current manifest and `managed-files.txt` formats are not
fixed contracts. New state may be versioned and migrated. Compatibility with
an existing installation is a deliberate legacy-support path, rather than a
reason to retain the current implementation unchanged.

## 3. Command meanings

**Decision:** `agent-distro install` and `agent-distro update` both change
selected assets in a target repository. `install` warns when the target
already has Agent Distro state. `agent-distro upgrade` updates the globally
installed Agent Distro CLI itself.

**Implication:** `update` is never used for the CLI. The target mutation path
can share one implementation; the distinct commands communicate first-time
installation versus an existing managed target. The exact selection behavior
of `update` is prefilled from recorded target state, so the user can keep or
adjust it intentionally.

## 4. Deselected assets

**Decision:** When an installation or update deselects an Agent Distro-managed
asset, move it to `.agent-distro/.archive/` rather than deleting it.

**Implication:** Each mutation writes a transaction-specific Markdown record at
`.agent-distro/.archive/<id>/README.md` alongside the retained files and reports
the archive location. Entries are retained until the user removes them; there is
no restore command in this foundation, so users can inspect or copy them back.

## 5. New-install defaults

**Decision:** A new `agent-distro install` starts with no assets selected.

**Implication:** Agent Distro is opt-in by default. Profiles, categories, stacks, and
individual assets are explicit user choices rather than implicit baseline
installation.

## 6. Stack-first selection

**Decision:** Installation starts by selecting stacks. Agent Distro then presents only
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

## 7a. Initial catalog scope

**Decision:** The initial catalog has explicitly selectable **Common**,
**JavaScript**, and **.NET** stacks. Common owns cross-runtime workflow assets;
technology stacks own only technology-specific guidance.

**Implication:** `assets/profiles.json` is the authored source: it declares
top-level stacks and assigns every profile to one stack. The generated catalog
records stack ownership for every profile and asset, so new stacks do not
require a selection-model redesign.

## 8. Shared target paths

**Decision:** Merge compatible contributions from selected stacks that target
the same managed path. A true content conflict stops the operation.

**Implication:** Each provider records a source identity, target path, and
merge rule. The first supported rule is recursive JSON-object merge: distinct
keys combine at every object depth; equal scalar values agree and divergent
values are unmergeable.
Other formats are unmergeable until they declare a rule. Agent Distro must not
silently choose one provider's content over another's.

## 9. Conflict recovery

**Decision:** In the interactive flow, an unmergeable conflict offers the
user a provider choice before any write. `--force` permits installation or
update to replace conflicting content, first moving the displaced content to
`.agent-distro/.archive/`. Fatal errors always provide an opt-in bug-report path.

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

**Decision:** For now, `agent-distro upgrade` updates a locally cloned Agent Distro checkout,
then repacks and reinstalls the global CLI.

**Implication:** Npm publication is deferred. Upgrade must make the checkout
location and any Git/update failure visible to the user.

## 12. Managed checkout location

**Decision:** Retain `agent-distro bootstrap`. It creates the managed runtime copy at
`~/.agent-distro/repo` by default and lets the user opt into choosing another
location.

**Implication:** The existing bootstrap implementation will be replaced by the
new Node-based flow. `agent-distro upgrade` uses the selected checkout location.

## 13. First installation

**Decision:** First-time users clone Agent Distro, enter that source checkout, and
run `bin/agent-distro bootstrap`. Bootstrap creates the managed runtime copy from
that checkout; it does not independently discover or download a source.

**Implication:** Reuse the Node packed-artifact bootstrap pattern for the
managed runtime: package it, install the global CLI, and prove it. The
managed-copy model remains the default; shell integration is a separate
implementation choice.

## 14. Doctor scope

**Decision:** `agent-distro doctor` always reports global CLI and managed-runtime
state. When run inside, or explicitly pointed at, a repository, it separately
reports the repository's `.agent-distro/` state.

**Implication:** Global and target diagnostics are equal first-class sections
of one doctor report. The report must make it clear when the current directory
is not an Agent Distro-managed repository, but that condition still exits
successfully.

**Exit decision:** Absence of a managed checkout or target installation is
informational and exits zero. A present target manifest with malformed or
drifted managed content exits nonzero. The running global CLI has no separate
verifiable damage state in this foundation; its managed-checkout presence is
reported without turning a usable command into a failure.

## 15. Programmatic doctor

**Decision:** `agent-distro doctor --json` emits a stable, path-safe machine-readable
report alongside the normal human-readable doctor output.

**Implication:** The JSON contract is read-only and safe for scripts and CI;
it must not expose repository contents, secrets, or absolute paths.

## Required Agent Distro work

1. Keep the proven Node/Commander/Clack structure as `agent-distro` and write
   target state under `.agent-distro/`.
2. Replace the global profile model with a stack-first catalog: Common and
   technology stacks each own profiles and eligible assets.
3. Add target-state migration, prefilled `update`, archive records, compatible
   target-path merges, interactive conflict choice, and force-with-archive.
4. Replace the bootstrap contract with the managed-copy model at
   `~/.agent-distro/repo`, while retaining the packed global artifact proof.
5. Extend doctor into global plus target sections and preserve a path-safe JSON
interface.

## 16. Legacy state migration

**Decision:** Version-1 manifests remain readable. Their recorded files are
matched to the current catalog to prefill a safe update; on the next successful
mutation Agent Distro writes a version-2 manifest. Files no longer represented
by the catalog are not silently retained as selections: they are archived with
the same transaction.

**Implication:** A legacy manifest never needs a destructive in-place rewrite.
Malformed manifests fail safely and require explicit repair before mutation.
6. Carry forward transactional filesystem safety, recovery, package smoke
   tests, cross-platform verification, and the opt-in TUI.

## Questions intentionally still open

1. What exit status should doctor use when global or target checks find actual
   damage, as distinct from an unmanaged current directory?
2. Which target-path formats are mergeable, and what is each format's explicit
   merge rule?
3. Which final commands are retained beyond `bootstrap`, `install`, `update`,
   `upgrade`, and `doctor`—especially recovery, profile listing, validation,
   and issue reporting?
4. Should shell PATH integration remain part of bootstrap, or should the
   package manager's global bin location be the only supported launcher path?
5. Which Agent Distro branch and PR sequence should carry the completed
   foundation?

## Delivery boundary

Implement Agent Distro stories only when the needed open decisions are settled.
This brief is updated and committed whenever a decision changes. The later
ASDLC port is explicitly out of scope.
