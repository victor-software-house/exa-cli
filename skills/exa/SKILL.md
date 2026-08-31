---
name: exa
description: Use the Exa CLI for current web evidence, known-page retrieval, cited answers, coding context, or asynchronous Exa Agent research. Prefer it over ad-hoc HTTP; use GitHub tooling or an existing clone or submodule for GitHub implementation truth.
---

# Exa CLI

Install the GitHub Release binary with mise (`"github:victor-software-house/exa-cli" = "0.0.0"`) or globally from npm (`bun add -g @victor-software-house/exa-cli`, Node 20+). The CLI binary is `exa`.

```bash
npx skills add victor-software-house/exa-cli
```

For interactive use, run `exa auth login`; it stores the key in the OS credential store. For automation, use `EXA_API_KEY`. `--api-key` has highest precedence but can expose the key through the process list. Never print the key.

## Cost discipline

Every uncached call spends Exa credits. The local SQLite cache makes identical requests within the TTL free — a hit prints `cache hit age=…` on stderr. Rules:

- Never re-issue an identical request; the response is already cached.
- `--refresh` only when a cached answer is provably stale.
- `--no-cache` almost never.
- Agent commands (`agent create`, `agent get`, `agent wait`, `agent cancel`) are never cached.
- Housekeeping: `exa cache path`, `exa cache prune` (expired entries), `exa cache clear`.

The cache key includes a digest of the API key, so switching accounts never serves another account's responses.

## Output

Without flags the CLI prints human-readable text, even when piped. For machine consumption always pass `--json` (compact) or `--pretty` (indented; implies JSON). `-o FILE` always writes JSON regardless of the file extension. `--envelope` wraps JSON with cache metadata.

## Retention workflow

Capture the complete response once, project from the file, never re-fetch to re-project:

```bash
out_dir="${CLAUDE_JOB_DIR:-$(mktemp -d)}/exa"
mkdir -p "$out_dir"

exa search "precise query with entity and source qualifier" \
  --include-domain exa.ai \
  --json -o "$out_dir/search.json"

jq '.results[] | {url, title}' "$out_dir/search.json"
```

## Commands

```bash
exa search "precise query with entity and source qualifier" --include-domain exa.ai --json
exa contents https://exa.ai/docs/reference/search.md --json
exa answer "narrow question" --json
exa similar https://exa.ai/docs/reference/search.md --json
exa context "how to use React hooks for state management" --tokens-num 500 --json
```

Agent runs (create is not cached; block with `--wait` or `agent wait` instead of a manual poll loop):

```bash
exa agent create "narrow research question" --json
exa agent create "narrow research question" --wait --timeout 600 --json
exa agent get agent_run_… --json
exa agent wait agent_run_… --timeout 600 --json
exa agent cancel agent_run_… --json
```

Raw body is JSON text for that command's generated Hey API schema. Optique parses it; do not pass a file path:

```bash
exa search --request '{"query":"Exa search type auto","contents":{"highlights":true}}' --json
```

Do not treat snippets, citations, or generated answers as proof. Read the cited URL before making a factual claim.

`/context` is `exa context`. Agent runs are `exa agent create`, `exa agent get`, `exa agent wait`, and `exa agent cancel`. GitHub implementation truth still stays `gh` or a pinned submodule.
