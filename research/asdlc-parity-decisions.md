# ASDLC parity decisions

This record resolves product decisions before moving Agent Distro foundations
into the ASDLC codebase.

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
