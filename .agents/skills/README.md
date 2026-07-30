# Development skills

These are repository-local workflows for maintaining Agent Distro. They are
not distributable Agent Distro assets and are deliberately separate from
`assets/` and `plugins/`.

| Skill | Use for | Source snapshot |
| --- | --- | --- |
| `systematic-debugging` | Root-cause investigation before a fix | [Obra Superpowers](https://github.com/obra/superpowers) `44c9b2d6e889982ac18c27d05a19fefe335194e1` |
| `test-driven-development` | Proving a behavior change or regression | [Obra Superpowers](https://github.com/obra/superpowers) `44c9b2d6e889982ac18c27d05a19fefe335194e1` |
| `using-git-worktrees` | Isolating concurrent work | [Obra Superpowers](https://github.com/obra/superpowers) `44c9b2d6e889982ac18c27d05a19fefe335194e1` |
| `verification-before-completion` | Evidence before commit, PR, or completion claim | [Obra Superpowers](https://github.com/obra/superpowers) `44c9b2d6e889982ac18c27d05a19fefe335194e1` |
| `code-review-and-quality` | Focused self-review before merge | [Addy Osmani Agent Skills](https://github.com/addyosmani/agent-skills) `7829ffd90d973b6325f5f12f1b1226dcace74443` |
| `documentation-and-adrs` | Recording non-obvious decisions | [Addy Osmani Agent Skills](https://github.com/addyosmani/agent-skills) `7829ffd90d973b6325f5f12f1b1226dcace74443` |
| `ci-cd-and-automation` | Maintaining PR quality gates | [Addy Osmani Agent Skills](https://github.com/addyosmani/agent-skills) `7829ffd90d973b6325f5f12f1b1226dcace74443` |
| `observability-and-instrumentation` | Designing proportionate, safe diagnostics | [Addy Osmani Agent Skills](https://github.com/addyosmani/agent-skills) `7829ffd90d973b6325f5f12f1b1226dcace74443` |
| `security-and-hardening` | Filesystem, configuration, and dependency boundaries | [Addy Osmani Agent Skills](https://github.com/addyosmani/agent-skills) `7829ffd90d973b6325f5f12f1b1226dcace74443` |
| `code-simplification` | Removing complexity after a behavior change | [Addy Osmani Agent Skills](https://github.com/addyosmani/agent-skills) `7829ffd90d973b6325f5f12f1b1226dcace74443` |
| `source-driven-development` | Using current official documentation for tool-specific work | [Addy Osmani Agent Skills](https://github.com/addyosmani/agent-skills) `7829ffd90d973b6325f5f12f1b1226dcace74443` |

Upstream projects normally recommend harness plugins for automatic triggering.
This is intentionally a smaller repository policy: agents that support
project-local discovery can use these eleven workflows without cloning the full
upstream catalogs. Their MIT license texts are retained in [`licenses/`](./licenses/).

Update only a selected skill when its upstream change is needed. Copy its
required supporting files, record the source commit above, and keep this
directory independent of the published package.
