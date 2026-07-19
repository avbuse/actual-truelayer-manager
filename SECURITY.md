# Security

## Dependency overrides

### `adm-zip` (GHSA-xcpc-8h2w-3j85)

`@actual-app/api` (optional, live Actual sync only) pulls in
`@actual-app/core`, which depends on `adm-zip ^0.5.17`. Versions below `0.6.0`
are affected by [GHSA-xcpc-8h2w-3j85](https://github.com/advisories/GHSA-xcpc-8h2w-3j85)
(crafted ZIP → unbounded memory allocation).

This repository pins a safe transitive version via an npm override:

```json
"overrides": {
  "adm-zip": "^0.6.0"
}
```

Why an override instead of changing `@actual-app/api`:

- npm’s suggested fix (`@actual-app/api@26.3.0`) is a **downgrade** and would
  break compatibility with current Actual Budget servers.
- Stable `@actual-app/api@26.7.0` still declares `adm-zip ^0.5.17`.
- Actual’s `26.8.0` nightlies replace `adm-zip` with `fflate`; once a stable
  release ships without the vulnerable package, this override can be removed.

Operator risk with the override in place: the vulnerable `<0.6.0` package is
not installed. `adm-zip` is only reached through the optional live Actual sync
path (budget backup / cloud-storage / YNAB4 import code inside `@actual-app/core`),
not through demo mode or TrueLayer-only flows.

Track upstream: watch
[`@actual-app/api`](https://www.npmjs.com/package/@actual-app/api) / Actual
release notes for a stable line that drops `adm-zip`, then drop the override and
re-run `npm audit --omit=dev`.
