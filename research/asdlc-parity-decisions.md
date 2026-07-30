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
