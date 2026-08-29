---
name: exa
description: Use the Exa CLI for live web search, known-page contents, and cited answers. Use when a question needs current web evidence and GitHub source is not already a clone or submodule. Prefer this CLI over ad-hoc HTTP.
---

# Exa CLI

Install from GitHub:

```bash
npx skills add victor-software-house/exa-cli
```

The CLI binary is `exa` (`npx @victor-software-house/exa-cli` if `exa` collides with another tool).

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

Raw body:

```bash
exa search --request request.json --json
```

Do not treat snippets, citations, or generated answers as proof. Read the cited URL before making a factual claim.

`/context` (Exa Code) is not a first-class command. GitHub truth stays `gh` or a pinned submodule.
