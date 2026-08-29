---
name: exa
description: Use the Exa CLI for live web search, known-page contents, and cited answers. Use when a question needs current web evidence and GitHub source is not already a clone or submodule. Prefer this CLI over ad-hoc HTTP.
---

# Exa CLI

Install the GitHub Release binary with mise (`"github:victor-software-house/exa-cli" = "0.0.0"`). The CLI binary is `exa`.

```bash
npx skills add victor-software-house/exa-cli
```

Auth is `EXA_API_KEY` or `--api-key`. Do not print the key.

## Cache

The CLI caches identical requests in SQLite. Do not repeat an identical call. Use `--refresh` only when you need a fresh provider response. `--no-cache` disables the store.

Stdout is the payload. Cache hits print on stderr. `--json` is `jq`-friendly provider JSON.

## Commands

Search (always include `contents.highlights` by default):

```bash
exa search "precise query with entity and source qualifier" --include-domain exa.ai --json
```

Known pages:

```bash
exa contents https://exa.ai/docs/reference/search.md --json
```

Cited synthesis:

```bash
exa answer "narrow question" --json
```

Raw body is JSON for that command’s generated Hey API schema. Optique parses it; do not pass a file path:

```bash
exa search --request '{"query":"Exa search type auto","contents":{"highlights":true}}' --json
```

Do not treat snippets, citations, or generated answers as proof. Read the cited URL before making a factual claim.

`/context` (Exa Code) is not a first-class command. GitHub truth stays `gh` or a pinned submodule.
