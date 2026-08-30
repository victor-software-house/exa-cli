# Pinned Exa OpenAPI spec

| Field | Value |
|:--|:--|
| Repository | https://github.com/exa-labs/openapi-spec |
| Commit | `57d917823aa0cec02385104dc3bb795cdf5d7da8` |
| File | `exa-openapi-spec.yaml` |
| Copied as | `vendor/exa-openapi.yaml` |

That GitHub artifact omits `POST /context` and the Agent API. Those paths are local overlays in the same file, taken from [Context (Exa Code)](https://exa.ai/docs/reference/context.md) and the current public spec at `https://exa.ai/docs/exa-spec.yaml` (`/agent/runs`, `/agent/runs/{id}`, `/agent/runs/{id}/cancel` only).

Do not fetch a floating URL at generate time. Bump the GitHub pin by replacing the upstream copy, keeping the local overlays, updating the commit above, and running `mise run schema:generate`.