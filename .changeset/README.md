# Changesets

Create a changeset for every user-visible change:

```bash
bunx changeset
```

CI owns `changeset version`. Publish is `bun publish` via bun-release, never
`changeset publish`. Do not run either locally.
