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

## Story 1 — Establish dependency governance

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

## Story 2 — Major-version upgrade spikes

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

## Story 3 — Pre-1.0 tool monitoring

- [ ] Before accepting a new `tsdown` or `oxfmt` minor version, review its
  release notes, lockfile change, install scripts, and optional native bindings.
- [ ] Keep `tsdown` on non-prerelease releases only unless an approved defect
  requires a beta and the beta is explicitly pinned.
- [ ] Verify each accepted tool update through the existing Node 20.12, 22.18,
  24.11, and 26 packaged-runtime matrix on macOS and Windows.
- [ ] Do not replace tsdown/Oxc tooling unless the evidence shows a concrete
  support, security, or cross-platform failure.

Acceptance: fast-moving tooling updates are deliberate and proven, not absorbed
incidentally through a range update.

## Story 4 — Re-run the spike

- [ ] Re-run the direct-dependency inventory and lockfile audit before the next
  public npm release or within 90 days.
- [ ] Update the adoption and release-recency table using npm registry data.
- [ ] Reconsider a schema library only if the same schema must validate at least
  three boundaries: generated catalog, persisted state, CLI input, or public API.

Acceptance: the dependency decision record remains current and no unreviewed
library becomes part of Agent Distro's runtime path.
