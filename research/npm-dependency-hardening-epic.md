# npm dependency hardening epic

## Objective

Keep Agent Distro's dependency surface small, mainstream, reproducible, and
cross-platform without replacing safe Node-standard-library behavior for style.

The governing decision record is
[npm dependency hardening spike](./npm-dependency-hardening-spike.md).

## Completion rule

Complete tasks in order. A task is checked only with a link to the exact pull
request, committed lockfile, and completed macOS/Windows verification for that
PR head. A dependency replacement requires a demonstrated production gap and
must remove more risk or code than it introduces.

## Story 0 — Raise the runtime floor

- [x] Change the package, bootstrap, and contributor runtime contract to Node
  `^22.22.2 || ^24.15.0 || >=26.0.0 <27`.
- [x] Align version files, CI, packaging checks, and user-facing compatibility
  errors with that single range.
- [x] Replace the Node 20.12, 22.18, and 24.11 matrix lanes with Node 22.22.2,
  24.15, and 26 packaged-runtime proof on macOS and Windows.
- [x] Give unsupported Node installations an actionable error before any
  filesystem mutation.

Acceptance: Agent Distro has one tested Node 22+ baseline, and its declared
range admits the latest maintained npm resolver tooling without accepting an
unsupported early Node release.

## Decision — npm artifact distribution

Agent Distro does not distribute artifacts through npm packages. Therefore
`pacote`, `npm-package-arg`, `npm-registry-fetch`, `@npmcli/arborist`, and the
associated resolver are intentionally out of scope. Reopen this decision only
if npm becomes an approved artifact-distribution channel.

## Story 2 — Prevent concurrent mutation

- [ ] Add a focused `proper-lockfile` spike for exact target and managed-global
  state paths.
- [ ] Use bounded acquisition and `finally`-based release; stale-lock recovery
  must be explicit and visible to the user.
- [ ] Prove competing installs, update versus install, interruption, and lock
  cleanup on macOS and Windows.
- [ ] Do not introduce a process-wide/global lock or lock individual files.

Acceptance: concurrent Agent Distro processes cannot interleave mutations of
one target or the managed global checkout.

## Story 3 — Establish dependency governance

- [ ] Add a concise dependency-admission policy to contributor instructions.
- [ ] Record the purpose, import site, license, adoption, lifecycle-script, and
  removal condition for each future direct dependency.
- [ ] Add an automated `npm audit --package-lock-only --json` CI check with a
  documented critical/high triage rule.
- [ ] Run and evaluate `npm audit signatures` after `npm ci`; document any
  registry-signature limitations rather than suppressing them.
- [ ] Enable native GitHub dependency updates for npm and GitHub Actions, with
  grouped dev-tool updates and separate runtime-major pull requests.

Acceptance: a contributor can add or update a package through one documented,
reproducible, reviewable path without an untriaged critical/high advisory.

## Story 4 — Major-version upgrade spikes

- [ ] Create a focused `commander` 14-to-15 compatibility spike.
- [ ] Read the upstream release notes and identify all changed APIs used by
  `src/cli.ts` and `src/commands/`.
- [ ] Upgrade only if `npm test`, `npm run test:proof`, `npm pack --dry-run`,
  and exact-head macOS/Windows package checks pass.
- [ ] Create a separate, test-only `execa` 9-to-10 compatibility spike.
- [ ] Retain the current version when either upgrade changes the public CLI,
  Windows path behavior, or package proof without a compensating benefit.

Acceptance: each accepted major has an isolated PR and exact cross-platform
evidence; rejected upgrades are documented with a review date.

## Story 5 — Pre-1.0 tool monitoring

- [ ] Before accepting a new `tsdown` or `oxfmt` minor version, review its
  release notes, lockfile change, install scripts, and optional native bindings.
- [ ] Keep `tsdown` on non-prerelease releases only unless an approved defect
  requires a beta and the beta is explicitly pinned.
- [ ] Verify each accepted tool update through Node 22.22.2, 24.15, and 26
  packaged-runtime lanes on macOS and Windows.
- [ ] Do not replace tsdown/Oxc tooling unless the evidence shows a concrete
  support, security, or cross-platform failure.

Acceptance: fast-moving tooling updates are deliberate and proven, not absorbed
incidentally through a range update.

## Story 6 — Re-run the spike

- [ ] Re-run the direct-dependency inventory and lockfile audit before the next
  public npm release or within 90 days.
- [ ] Update the adoption and release-recency table using npm registry data.
- [ ] Reconsider a schema library only if the same schema must validate at least
  three boundaries: generated catalog, persisted state, CLI input, or public API.

Acceptance: the dependency decision record remains current and no unreviewed
library becomes part of Agent Distro's runtime path.
