# @victor-software-house/exa-cli

Public Exa CLI. This is not the infer-lab aggregator.

## Layout

| Path | Role |
|:--|:--|
| `src/cli.ts` | Process entry |
| `src/parser.ts` | Optique grammar |
| `src/app.ts` | Command dispatch, I/O |
| `src/cache/` | `bun:sqlite` request cache |
| `src/http/` | Hey API client wrapper |
| `src/output/` | stdout/stderr presenter |
| `src/generated/` | OpenAPI output — regenerate, do not edit |
| `mise-tasks/` | Bun file tasks (`schema`, `schema:check`, `compile`, `version-guard`, `release:binaries`) |
| `vendor/exa-openapi.yaml` | SHA-pinned Exa spec |
| `skills/exa/` | skills.sh skill |

## Invariants

- Generated HTTP types live in `src/generated/`. Run `mise run schema` after bumping `vendor/PIN.md`. Never hand-edit generated files.
- Cache defaults on. `--refresh` skips reads. `--no-cache` skips reads and writes. Key is SHA-256 of canonical `{ host, operation, body }`.
- Stdout is the payload. Stderr is progress, errors, cache hits, and “wrote file.” `--json` is the provider body unless `--envelope`.
- `EXA_API_KEY` or `--api-key`. CLI flag wins. Do not print the key.
- TypeScript 5.9 is required for `@hey-api/openapi-ts` 0.99 (TypeScript 7’s JS compiler API does not export `SyntaxKind`). `tsc` is 5.9 until Hey API supports TypeScript 7.
- Generated files are stamped with `// @ts-nocheck` after each `mise run schema` because Hey API output does not satisfy `exactOptionalPropertyTypes`.
- Provider JSON is validated with the generated Zod schemas in `src/generated/zod.gen.ts`. Do not re-declare response shapes with `as { … }`.

## Tasks

```bash
mise run verify          # lint + typecheck + unit tests + build
mise run schema          # regenerate src/generated
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

Versioning is changeset-driven after a one-time `0.0.0` bootstrap.

1. First published version is **`0.0.0`**, shipped by the initial commit with **no** changeset file. Operator publishes it once (`npm publish --access public`), tags `v0.0.0`, and configures npm trusted publishing for `.github/workflows/release.yml`.
2. Later functional PRs add a `.changeset/*.md` file. Default bump is `patch` (`0.0.1` is the first changeset-driven release).
3. `changesets/action` opens a **Version Packages** PR. Operator merges it → CI publishes via OIDC and uploads compiled binaries to the GitHub Release.

- Never run `changeset version` or `changeset publish` locally.
- Never hand-edit versions in `package.json` or `CHANGELOG.md` after the `0.0.0` scaffold.
- `minor` only for notable new surface. Never `major` on `0.x` unless explicitly decided.
- No `NPM_TOKEN` in workflows.
- Runners are GitHub-hosted `ubuntu-24.04`, not Namespace.

## Conventions

- Conventional Commits; no AI attribution trailers
- No `../` imports in `src/` or `test/` — use `@cli/*` and `@test/*`
- Tabs, single quotes, 100-col (Biome)
- Skills live in `skills/exa/`
