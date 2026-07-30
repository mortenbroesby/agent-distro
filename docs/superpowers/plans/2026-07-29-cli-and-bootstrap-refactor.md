# CLI and Bootstrap Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a small doctor-based CLI and a one-command bootstrap that installs the real packed artifact globally from a local checkout.

**Architecture:** cli.ts becomes only Commander composition and error handling. Command modules own their own Commander syntax, the transactional installer remains in install.ts, and Clack moves to interactive-install.ts. bootstrap.mjs builds a temporary npm tarball, globally installs it, and invokes the installed binary without modifying a target repository.

**Tech Stack:** Node >=20.12.0 <27 runtime, tsdown on Node ^22.18.0 or >=24.11.0 <27 for checkout builds, Commander, @clack/prompts, npm CLI, Vitest, Oxfmt, Oxlint.

## Global Constraints

- Preserve the packed CLI's Node >=20.12.0 <27 runtime support; checkout builds require Node ^22.18.0 or >=24.11.0 <27 for tsdown. Add no dependency.
- Keep install, recover, profiles, and report-issue; replace verify and diagnostics with doctor [target] and doctor --diagnostics [target].
- install without a target prompts in the TUI; doctor without a target verifies process.cwd().
- Preserve stable failure codes, transactional safety, empty default selection, and explicit --force semantics.
- Bootstrap never calls install; it uses a temporary tarball and reports global-install failures without privilege escalation.
- Do not edit pinned .agents submodules.
- Exclude the development-only .agents/** submodules from Oxfmt and Oxlint; lint and formatting must still cover repository-owned files.

---

### Task 1: Establish doctor command contract

**Files:**
- Create: src/commands/doctor.ts
- Modify: src/cli.ts
- Modify: test/agent-distro.test.mjs

**Interfaces:**
- Consumes: verify(target: string): number and diagnostics(target: string): number from src/doctor.ts.
- Produces: registerDoctorCommand(program: Command, setExitCode: (code: number) => void): void.
- Contract: doctor [target] verifies target or process.cwd(); doctor --diagnostics [target] prints diagnostics; verify and diagnostics are unknown commands.

- [x] **Step 1: Write the failing test**

~~~js
it("groups verification and diagnostics under doctor", () => {
  const destination = target();
  run(destination);
  expect(command("doctor", destination)).toContain("Verified");
  expect(JSON.parse(command("doctor", "--diagnostics", destination))).toMatchObject({
    target: { exists: true, directory: true },
  });
  expect(failed("verify", destination)).toContain("unknown command 'verify'");
});
~~~

Add a second assertion that runs doctor with no target from destination and
expects the same verification output.

- [x] **Step 2: Run it and verify RED**

Run: npx vitest run test/agent-distro.test.mjs --no-file-parallelism

Expected: FAIL because doctor is unknown.

- [x] **Step 3: Add the minimal command module**

~~~ts
export function registerDoctorCommand(program: Command, setExitCode: (code: number) => void) {
  program
    .command("doctor [target]")
    .option("--diagnostics", "print a safe read-only diagnostics snapshot")
    .action((target, options) => {
      setExitCode(options.diagnostics ? diagnostics(target ?? process.cwd()) : verify(target ?? process.cwd()));
    });
}
~~~

Remove the old top-level verify and diagnostics registrations from cli.ts.

- [x] **Step 4: Run the focused suite and verify GREEN**

Run: npx vitest run test/agent-distro.test.mjs --no-file-parallelism

Expected: PASS with recovery tests updated to use doctor.

- [x] **Step 5: Commit**

Run: git add src/cli.ts src/commands/doctor.ts test/agent-distro.test.mjs && git commit -m "refactor: group checks under doctor"

### Task 2: Extract command registrations

**Files:**
- Create: src/commands/install.ts
- Create: src/commands/profiles.ts
- Create: src/commands/report-issue.ts
- Modify: src/cli.ts
- Modify: src/agent-distro.ts
- Test: test/agent-distro.test.mjs

**Interfaces:**
- Consumes: install, recover, assetChoices, profileChoices, interactiveInstall, and reportIssue.
- Produces: registerInstallCommand, registerProfilesCommand, and registerReportIssueCommand, each with (program: Command, setExitCode: (code: number) => void).
- Contract: every command/option/output apart from Task 1's doctor rename remains unchanged.

- [x] **Step 1: Run the existing command-characterization suite**

Run: npx vitest run test/agent-distro.test.mjs --no-file-parallelism

Expected: PASS. Task 1 already introduced the only public command behavior;
this task is a pure extraction protected by its existing install, recovery,
profile, report, and failure-code assertions.

- [x] **Step 2: Extract syntax and action translation**

install.ts owns install flags and recover registration. profiles.ts serializes profileChoices. report-issue.ts owns report options. cli.ts constructs Command, invokes all registrations, and retains only bare-help and CommanderError handling.

- [x] **Step 3: Run the focused suite after extraction**

Run: npx vitest run test/agent-distro.test.mjs --no-file-parallelism

Expected: PASS with unchanged install, recovery, profile, issue-report, and failure-code behavior.

- [x] **Step 4: Commit**

Run: git add src/agent-distro.ts src/cli.ts src/commands test/agent-distro.test.mjs && git commit -m "refactor: isolate cli interactions"

### Task 3: Separate the interactive installer

**Files:**
- Create: src/interactive-install.ts
- Modify: src/install.ts
- Modify: src/commands/install.ts
- Modify: src/agent-distro.ts
- Modify: test/agent-distro.test.mjs

**Interfaces:**
- Consumes: install, assetChoices, profileChoices, and selectedCatalogAssets.
- Produces: runInteractiveInstall(target, prompts) and interactiveInstall(target?) from interactive-install.ts.
- Contract: TTY gating, empty selection, cancellation, task-log messages, and successful installation output stay unchanged.

- [x] **Step 1: Run the existing TUI characterization tests**

Run: npx vitest run test/agent-distro.test.mjs --no-file-parallelism

Expected: PASS. The existing adapter tests define the unchanging interactive
behavior, so no new public test is needed for this internal move.

- [x] **Step 2: Move only Clack code**

Move runInteractiveInstall, interactiveInstall, the Clack dynamic import, and the TTY gate into interactive-install.ts. Keep install, recover, catalog exports, and all filesystem transaction code in install.ts. Re-export the two interactive functions from agent-distro.ts, preserving the current public package surface without adding a second build entry.

- [x] **Step 3: Run the full suite after extraction**

Run: npm test

Expected: PASS; Clack adapter tests still prove selection, cancellation, and task-log progress without terminal emulation.

- [x] **Step 4: Commit**

Run: git add src/agent-distro.ts src/commands/install.ts src/install.ts src/interactive-install.ts test/agent-distro.test.mjs && git commit -m "refactor: separate interactive install"

### Task 4: Add packed global bootstrap

**Files:**
- Delete: scripts/install-local.mjs
- Create: scripts/bootstrap.mjs
- Modify: test/agent-distro.test.mjs
- Modify: test/package.test.mjs

**Interfaces:**
- Consumes: Node child_process, fs, os, path, npm, and the package tarball.
- Produces: node scripts/bootstrap.mjs [--doctor <target>].
- Contract: no argument globally installs and proves help; --doctor <target> additionally runs doctor; neither invokes install.

- [x] **Step 1: Write failing argument and isolated-prefix tests**

~~~js
it("rejects an incomplete bootstrap doctor option", () => {
  expect(failedBootstrap("--doctor")).toContain("Usage: node scripts/bootstrap.mjs [--doctor <target>]");
});

test("bootstraps the packed global binary without installing assets", async ({ repository }) => {
  const prefix = repository.plain("global prefix");
  await execa(process.execPath, [bootstrap], { env: { ...process.env, NPM_CONFIG_PREFIX: prefix } });
  const executable = path.join(prefix, process.platform === "win32" ? "agent-distro.cmd" : "bin/agent-distro");
  expect((await execa(executable, ["--version"])).stdout).toBe("0.0.0");
});
~~~

- [x] **Step 2: Run them and verify RED**

Run: npx vitest run test/agent-distro.test.mjs test/package.test.mjs --no-file-parallelism

Expected: FAIL because bootstrap.mjs is absent.

- [x] **Step 3: Implement bootstrap**

Use fs.mkdtempSync(path.join(os.tmpdir(), "agent-distro-bootstrap-")) plus try/finally. Run npm ci, parse the one-item JSON result from npm pack --json --pack-destination, globally install the archive without package lifecycle scripts, and invoke the global binary. Accept only no arguments or --doctor <target>.

- [x] **Step 4: Run focused bootstrap tests and proof**

Run: npx vitest run test/agent-distro.test.mjs test/package.test.mjs --no-file-parallelism && npm run test:proof

Expected: PASS; isolated prefix receives the packed CLI and bootstrap never installs assets.

- [x] **Step 5: Commit**

Run: git add scripts/bootstrap.mjs scripts/install-local.mjs test/agent-distro.test.mjs test/package.test.mjs && git commit -m "feat: bootstrap packed global cli"

### Task 5: Exclude pinned development skills from repository checks

**Files:**
- Modify: .oxfmtrc.json
- Modify: .oxlintrc.json

**Interfaces:**
- Consumes: the pinned, development-only .agents/** submodules described by AGENTS.md.
- Produces: repository-wide fmt:check and lint commands that inspect only repository-owned content.
- Contract: assets/catalog.json, plugins/agent-distro/**, markdown, dist/**, node_modules/**, and now .agents/** retain their existing exclusion intent; no vendored skill file changes.

- [x] **Step 1: Write the failing repository-check characterization**

Run: npm run fmt:check && npm run lint

Expected: FAIL only on files under .agents/**, proving the current check configuration scans pinned vendor content.

- [x] **Step 2: Add the minimal paired ignore patterns**

Add .agents/** to the existing ignorePatterns arrays in both Oxc configuration files. Do not change lint rules, formatter style, or the submodule contents.

- [x] **Step 3: Run repository-wide checks and verify GREEN**

Run: npm run fmt:check && npm run lint

Expected: both commands exit 0 while the repository-owned source and tests remain covered.

- [x] **Step 4: Commit**

Run: git add .oxfmtrc.json .oxlintrc.json && git commit -m "chore: ignore pinned development skills"

### Task 6: Final verification and delivery

**Files:**
- Modify: docs/superpowers/plans/2026-07-29-cli-and-bootstrap-refactor.md

**Interfaces:**
- Consumes: all preceding task contracts.
- Produces: a current ready-for-review PR with hosted macOS and Windows evidence.

- [x] **Step 1: Check boxes only after each matching evidence command passes**

Keep incomplete tasks unchecked.

- [x] **Step 2: Run final local verification**

Run: npm run fmt:check && npm run lint && npm test && npm run test:proof && npm pack --dry-run --json && git diff --check

Expected: every command exits 0; package includes CLI and assets but not development-only skills or a root README.

- [x] **Step 3: Rebase and push**

Run: git fetch origin && git rebase origin/main && git merge-base --is-ancestor origin/main HEAD && git push --force-with-lease origin massive-refactor

Expected: merge-base exits 0 and the successor PR is updated (PR #27 is already merged).

- [ ] **Step 4: Confirm exact-head hosted checks**

Run: gh pr checks 27 --watch --interval 10

Expected: macos and windows both report pass.

- [x] **Step 5: Record local evidence and prepare the successor PR**

Evidence: final serial verification passed: 39 tests, proof, package dry run, and diff check. Final whole-branch review found no issues. Hosted checks remain pending publication.
