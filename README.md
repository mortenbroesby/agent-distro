# Agent Distro

Agent Distro installs curated agent-development assets into a repository. It
starts with no selected assets, so each installation is explicit and scoped to
the destination you choose.

## Quick start

Install Git and Node 22.23.1, then clone the repository and run one command:

```sh
git clone https://github.com/mortenbroesby/agent-distro.git
node agent-distro/scripts/install-local.mjs /path/to/repository
```

The Node bootstrap works on macOS and Windows. It installs the locked
dependencies, builds Agent Distro, then starts the normal interactive
installer. To update later, pull the checkout and run the same command again:

```sh
git -C agent-distro pull --ff-only
node agent-distro/scripts/install-local.mjs /path/to/repository
```

For automation, append explicit install options:

```sh
node agent-distro/scripts/install-local.mjs /path/to/repository --profile debugging
node agent-distro/scripts/install-local.mjs /path/to/repository --asset .mcp.json
```

Use `--all` only when every bundled asset is intended. The installer refuses
to replace changed managed files unless `--force` is supplied.

## Packaged use

After installing a packaged copy, use the `agent-distro` command directly:

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
