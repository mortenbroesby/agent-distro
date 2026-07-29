# Agent Distro progress

| Priority | Status | Work | Next evidence |
| --- | --- | --- | --- |
| 0 | Active | [Cross-platform core and compatibility contract](../active/04-cross-platform-core-and-compatibility.md) | Explicit target semantics and true unchanged-install no-op |
| 0.1 | Active | [Interactive TUI and real-repository smoke](../active/05-interactive-tui-and-repository-smoke.md) | Reusable disposable repository fixture |
| 0 | Done | [Reliable installation and diagnostics](../done/00-reliable-installation-and-diagnostics.md) | Completed in hosted run `30475273988` on macOS and Windows |
| 1 | Done | [Opt-in issue-report handoff](../done/01-opt-in-issue-reporting.md) | Completed in hosted run `30475273988` on macOS and Windows |
| 1 | Done | [CLI command boundaries](../done/03-cli-command-boundaries.md) | PR #11 passed macOS and Windows verification |
| 2 | Deferred | Versioned npm distribution | Publishing is not planned; retain the local packed-install proof only |
| 3 | Done | Hosted native-Windows base proof | Run `30468852345` passed macOS and Windows npm package smoke |
| 4 | Ready | [Agent governance and PR workflow](../part/01-agent-governance-and-pr-workflow.md) | Story 2 PR delivery contract; Story 3 needs admin authorization |

Status meanings: **Active** has an executable checklist; **Ready** is scoped
but not selected; **Blocked** needs an external prerequisite; **Done** has
current verification evidence and belongs in `../done/`.

The active epic does not make other explicitly requested work invalid.
