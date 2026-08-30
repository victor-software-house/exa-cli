# @victor-software-house/exa-cli

Agent-friendly CLI for the [Exa](https://exa.ai/) API: search, contents, answer, similar, context, and agent runs, backed by a local SQLite request cache.

## Install

npm ships a launcher that pulls a prebuilt binary for your platform. Node 20+ is enough — Bun is embedded in the binary:

```bash
bun add -g @victor-software-house/exa-cli
npm install -g @victor-software-house/exa-cli
bunx @victor-software-house/exa-cli --help
```

Agents and operator checkouts install the rolling GitHub Release binary through mise. Pin `0.0.0` — that tag is a rolling channel, not a frozen npm version:

```toml
[tools]
"github:victor-software-house/exa-cli" = "0.0.0"
```

```bash
mise install
exa --help
```

Source checkout:

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
exa answer "when did Exa ship the context endpoint"
exa similar https://exa.ai/docs/reference/search.md
exa context "how to use React hooks for state management" --tokens-num 500
exa agent-create "narrow research question"
exa agent-create "narrow research question" --wait --timeout 600
exa agent-get agent_run_…
exa agent-wait agent_run_… --timeout 600
exa agent-cancel agent_run_…
exa doctor
exa cache path|clear|prune
```

Every command also accepts `--request '<json>'` with the raw provider body (validated against the generated schema for that endpoint) instead of the flag surface.

## Output

Format is flag-driven. There is no TTY sniffing and no file-extension inference: what you pass is what you get.

| Flags | Result |
|:--|:--|
| none | Human-readable text on stdout, even when piped |
| `--json` | Compact provider JSON |
| `--pretty` | Indented JSON (implies JSON, beats `--json`) |
| `-o FILE` | Always writes JSON to the file; `--pretty` indents it |
| `--envelope` | Wraps JSON output with `{ data, cache: { hit, ageMs } }` |

Writing to a file never transforms content — a `.md` output path still gets JSON. Progress, cache hits, and errors go to stderr, so `exa search … --json | jq .results` is always safe.

Color applies to the text render only: on by default on a TTY, controlled by `--color` / `--no-color` and `NO_COLOR` / `FORCE_COLOR`.

## Cache and cost

Every uncached call spends Exa credits. Identical requests within the TTL are served free from a local SQLite cache at `$XDG_CACHE_HOME/exa-cli/` or `~/.cache/exa-cli/`, announced as `cache hit age=…` on stderr.

- Cache keys include a digest of the API key — two accounts never share cached responses.
- Default TTL is 24 hours; `--ttl SECONDS` overrides per call.
- `--refresh` skips the read and overwrites the entry. Use only when staleness provably matters.
- `--no-cache` skips reads and writes.
- `exa cache prune` deletes expired entries; `exa cache clear` deletes all; `exa cache path` prints the database location.
- `agent-create`, `agent-get`, `agent-wait`, and `agent-cancel` never cache: create and cancel mutate, get and wait poll.

Do not repeat an identical call in a loop — the first response is already stored.

## Agent skill

```bash
npx skills add victor-software-house/exa-cli
```

## Development

```bash
mise install
mise run verify                 # lint + typecheck + unit tests + build
mise -E test run test:live      # paid Exa calls; skips without EXA_API_KEY
```

Releases are CI-owned: merge a changeset, the Release workflow opens a Version Packages PR, and merging it publishes to npm (six platform packages plus the launcher umbrella), tags, and uploads versioned binaries. A new npm package name needs a one-time `mise run release:bootstrap` first (browser login; same staged platforms CI publishes).
