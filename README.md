# @victor-software-house/exa-cli

Public CLI for [Exa](https://exa.ai/) search, contents, and answer.

## Install

```bash
npm install -g @victor-software-house/exa-cli
# or
npx @victor-software-house/exa-cli --help
```

The binary name is `exa`. That can collide with the old `exa` / `eza` ls replacement. Prefer `npx` / `bunx` when both are on `PATH`.

## Auth

Set `EXA_API_KEY`, or pass `--api-key`. There is no interactive login.

Operator checkouts with the global fnox profile `exa` get the key from mise (`mise.dev.toml` / `mise -E test`). Contributors can export the variable themselves.

## Commands

```bash
exa search "Exa search type auto vs neural official docs" --include-domain exa.ai
exa contents https://exa.ai/docs/reference/search.md
exa answer "What Exa search type replaces the deprecated research API?"
exa doctor
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
