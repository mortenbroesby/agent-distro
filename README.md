# Agent Distro

Agent Distro installs curated agent-development assets into a repository. It
starts with no selected assets, so each installation is explicit and scoped to
the destination you choose.

## Use

After installing a packaged copy, run the guided installer from a terminal:

```sh
agent-distro install /path/to/repository
```

For automation, choose a profile or individual assets explicitly:

```sh
agent-distro install /path/to/repository --profile debugging
agent-distro install /path/to/repository --asset .mcp.json
```

Use `--all` only when every bundled asset is intended. The installer refuses
to replace changed managed files unless `--force` is supplied.

```sh
agent-distro verify /path/to/repository
agent-distro recover /path/to/repository
agent-distro profiles
```

## Development

Node 22.23.1 is required. Install dependencies and run the full local suite:

```sh
npm ci
npm test
npm run test:proof
```

To run the local CLI directly, build it first and invoke its launcher:

```sh
npm run build
node bin/agent-distro.mjs install /path/to/repository
```

Profile definitions live in `assets/profiles.json`. Regenerate derived catalog
and Copilot plugin assets with `npm run assets:generate`; CI verifies they are
current with `npm run assets:check`.

The package is CLI-first. Its supported interface is the `agent-distro`
command and its documented subcommands, not undocumented JavaScript imports.
