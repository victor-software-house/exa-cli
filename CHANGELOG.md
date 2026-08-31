# Changelog

## 0.0.2

### Patch Changes

- Apply the documented dynamic Context token default and accept its observed cost response shape ([`83dd937`](https://github.com/victor-software-house/exa-cli/commit/83dd9375ad85618adfdd5ec8ac04a1da05773113)).

- Redesign generated help with concise command menus, focused errors, practical examples, and nested `agent` commands ([`2b9b5bf`](https://github.com/victor-software-house/exa-cli/commit/2b9b5bfa0efe04bd4b8152573b137b604f0f65c1)).

## 0.0.1

### Patch Changes

- Flag-driven output, per-key cache, `exa cache`, and real npm binaries ([`d0bb475`](https://github.com/victor-software-house/exa-cli/commit/d0bb4750b2874466541996a86e0d98db8e65a14d)).

  - Output resolution is now flags-only: `--pretty` implies JSON and wins, `--json` or `-o` select JSON, otherwise human text prints even when piped. `-o` always writes JSON. No TTY or file-extension inference — pass `--json` where scripts used to rely on pipe detection.
  - Cache keys now include a truncated SHA-256 of the API key; two accounts no longer share cached responses. Old entries silently miss — run `exa cache clear`.
  - New `exa cache path|clear|prune` for cache management.
  - npm now ships prebuilt per-platform binaries behind a Node launcher (`@victor-software-house/exa-cli-<platform>` optionalDependencies); the package runs anywhere Node 20+ exists, no Bun install required.
