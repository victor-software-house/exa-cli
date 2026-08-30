# @victor-software-house/exa-cli

Agent-friendly CLI for the [Exa](https://exa.ai/) API: search, contents, answer, similar, context, and agent runs, backed by a local SQLite request cache.

## Install

Agents and local checkouts install the GitHub Release binary through mise. Pin `0.0.0` — that tag is a rolling channel, not a frozen npm version:

```toml
[tools]
"github:victor-software-house/exa-cli" = "0.0.0"
```

```bash
mise install
exa --help
```

npm has the package at [`@victor-software-house/exa-cli`](https://www.npmjs.com/package/@victor-software-house/exa-cli); the compiled binary through mise stays the primary install. Source checkout:

```bash
mise install
bun src/cli.ts --help
```

The binary name is `exa`. That can collide with the old `exa` / `eza` ls replacement.

## Auth

Set `EXA_API_KEY`, or pass `--api-key`. There is no interactive login.

Operator checkouts with the global fnox profile `exa` get the key from mise (`mise.dev.toml` / `mise -E test`). Contributors can export the variable themselves.

## Commands

```bash
exa search "Exa search type auto vs neural official docs" --include-domain exa.ai
exa contents https://exa.ai/docs/reference/search.md
exa similar https://exa.ai/docs/reference/search.md
exa context "how to use React hooks for state management" --tokens-num 500
exa agent-create "narrow research question"
exa agent-create "narrow research question" --wait --timeout 600
exa agent-get agent_run_…
exa agent-wait agent_run_… --timeout 600
exa agent-cancel agent_run_…
```

Stdout is the payload. Stderr is progress, cache hits, and errors. `--json` keeps the provider body `jq`-friendly. Cache metadata stays on stderr unless `--envelope`.

## Cache

Identical requests are served from a local SQLite cache under `$XDG_CACHE_HOME/exa-cli/` or `~/.cache/exa-cli/`. Default TTL is 24 hours.

- `--refresh` ignores a stored hit and overwrites it
- `--no-cache` skips read and write
- `--ttl` overrides the TTL in seconds

Do not repeat an identical call from an agent loop. Use `--refresh` only when you need a fresh provider response.

## Agent skill

```bash
npx skills add victor-software-house/exa-cli
```

## Development

```bash
mise install
mise run verify
bun src/cli.ts search --help
```
