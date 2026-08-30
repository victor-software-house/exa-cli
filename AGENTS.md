# @victor-software-house/exa-cli

Public Exa CLI. This is not the infer-lab aggregator.

## Layout

| Path | Role |
|:--|:--|
| `src/cli.ts` | Process entry (`import "zod/compile"` first) |
| `src/parser.ts` | Optique grammar. `--request` is `zod(generated body schema)` |
| `src/env.ts` | Typed process env (`z.output`) |
| `src/app.ts` | Command dispatch, I/O |
| `src/cache/` | `bun:sqlite` request cache |
| `src/http/` | Hey API client wrapper |
| `src/output/` | stdout/stderr presenter |
| `src/generated/` | OpenAPI output — regenerate, do not edit |
| `mise-tasks/` | Bun file tasks (`schema:check`, `compile`, `version-guard`, `release`, `release:oidc`, `release:tags`, `release:binaries`, `release:versioned-binaries`). `schema:generate` is the one-liner in `mise.toml`. |
| `vendor/exa-openapi.yaml` | SHA-pinned Exa spec |
| `skills/exa/` | skills.sh skill |

## Invariants

- Generated HTTP types live in `src/generated/`. Run `mise run schema:generate` after bumping `vendor/PIN.md`. Never hand-edit generated files.
- `--request` is JSON text for that command’s generated body schema (`zSearchBody` / `zGetContentsBody` / `zAnswerBody` / `zFindSimilarBody` / `zGetContextBody` / `zCreateAgentRunBody`). The matching input types are `SearchBody` / `GetContentsBody` / `AnswerBody` / `FindSimilarBody` / `GetContextBody` / `CreateAgentRunBody`. Optique `@optique/zod` parses it. Hey API’s SDK `validator: true` is the HTTP boundary on the same schemas. There is no Hey API ↔ Optique plugin; the generated Zod is the shared contract. The TypeScript plugin does not emit a standalone body type for inline operation bodies — only `SearchData` with an inline `body`. Do not write `SearchData['body']` in app code except at the SDK call, where Zod input and Hey API optional keys diverge under `exactOptionalPropertyTypes`.
- Cache defaults on for search, contents, answer, similar, and context. Agent create/get/wait/cancel never cache: create is not idempotent; get and wait poll; cancel mutates. `--refresh` skips reads. `--no-cache` skips reads and writes. Key is SHA-256 of canonical `{ host, operation, body }`.
- `import "zod/compile"` (and bunfig `preload`) AOT-compiles schemas on first parse for speed. It does not shrink the binary. `z.coerce` flag parsers stay on the runtime path.
- TypeScript 7 (`typescript@7.0.2`) and Node 26. `tsc` is the native TS 7 binary. Pin `@hey-api/openapi-ts` to the `@next` snapshot (`0.0.0-next-20260824173136`) until stable ships the TypeScript-compiler-API removal. Do not use `0.99.0` — it reads `ts.SyntaxKind` from the package root, which TypeScript 7 does not export.
- Generated files get `// @ts-nocheck` via `output.header`. The client uses Hey API `auth()` for `x-api-key`, `throwOnError: true`, and SDK `responseStyle: 'data'`. Do not unwrap `{ data, error }` envelopes or stamp generated files after the fact.
- Do not re-declare request or response shapes in `app.ts`. Flag bodies are the generated Zod input types. `--request` is the generated Zod body. Live tests may `safeParse` CLI stdout as a test of our JSON output.

## Tasks

```bash
mise run verify          # lint + typecheck + unit tests + build
mise run schema:generate # regenerate src/generated
mise run schema:check    # generate, then fail if src/generated drifted
mise -E test run test:live  # paid Exa calls; skips without EXA_API_KEY
```

mise is the task runner. `package.json` has no task scripts except `prepublishOnly`. Task bodies that are more than a one-liner live in `mise-tasks/*.ts`.

## Secrets and mise envs

The public contract is `EXA_API_KEY`. Contributors may export it themselves. This operator checkout loads it through fnox-export from the **global** fnox profile `exa` (chezmoi-managed `~/.config/fnox/config.toml`). That profile contains only the search key. Do not export `EXA_SERVICE_KEY`.

| File | When | Secrets |
|:--|:--|:--|
| `.miserc.toml` | local default | `env = ["dev"]` |
| `mise.dev.toml` | local `cd` / `mise run` | fnox-export `exa` → `EXA_API_KEY` |
| `mise.test.toml` | `mise -E test` | same allow-list, for live tests without other `dev` extras |
| `mise.ci.toml` | `MISE_ENV=ci` in GitHub Actions | `FNOX_EXPORT_DISABLE=1`, no key |

`mise run test` and `mise run test:unit` are mocked. They do not need the key. Live tests skip when `EXA_API_KEY` is unset — CI never has it. Do not also special-case `CI`.

Safe checks (key names only, never values):

```bash
fnox list -P exa --no-defaults --no-color >/dev/null
mise env --json | jq 'keys'
```

## Release discipline

Versioning is changeset-driven. Publish is bun-release (`mise run release:oidc`,
then `bun publish --access public --tolerate-republish`, then `mise run release:tags`).
Never `changeset publish`. Never `publish:` on `changesets/action`.

Every `main` push compiles all six platform archives on `ubuntu-24.04` (`bun build --compile --target=…`) and create-or-clobbers GitHub Release `v0.0.0`. mise consumers pin `"github:victor-software-house/exa-cli" = "0.0.0"` and refresh the lock when they want new bytes. Versioned GitHub Releases (`v$version`) get the same six archives plus SHA256SUMS after `release:tags`, not from the rolling binaries job.

1. First published npm version is **`0.0.0`**. No changeset until that is live. The first changeset is a patch to `0.0.1`. Default bump is `patch`.
2. `changesets/action` opens a **Version Packages** PR (version only). Operator merges it → CI mints `BUN_CONFIG_TOKEN`, publishes with bun, tags, then uploads versioned binaries.

- Never run `changeset version` or `changeset publish` locally.
- Never hand-edit versions in `package.json` or `CHANGELOG.md` after the `0.0.0` scaffold.
- `minor` only for notable new surface. Never `major` on `0.x` unless explicitly decided.
- No `NPM_TOKEN` / `NODE_AUTH_TOKEN` in workflows. Auth is `$BUN_CONFIG_TOKEN` via bunfig.
- Runners are GitHub-hosted `ubuntu-24.04`, not Namespace. No macOS/Windows runner matrix.

## Conventions

- Conventional Commits; no AI attribution trailers
- No `../` imports in `src/` or `test/` — use `@cli/*` and `@test/*`
- Tabs, single quotes, 100-col (Biome)
- `tsconfig.json` typechecks src, tests, mise-tasks, and root configs. `tsconfig.build.json` is src-only for tsdown dts.
- Skills live in `skills/exa/`
