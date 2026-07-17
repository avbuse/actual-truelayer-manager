# actual-truelayer-manager

> An experiment in AI Coding

A single, Docker-first application for syncing UK Open Banking transactions from
[TrueLayer](https://truelayer.com/) into a self-hosted
[Actual Budget](https://actualbudget.org/) instance.

The full product specification lives in
[`actual-truelayer-manager-project-spec.md`](./actual-truelayer-manager-project-spec.md).

## Status

**Working prototype** covering spec phases 0–8:

- Fastify HTTP server (TypeScript, strict mode) with server-rendered UI
- Setup wizard, dashboard, connections, mappings, and redacted logs pages
- SQLite persistence (`better-sqlite3`) with migrations and repositories
- AES-256-GCM encryption for tokens/secrets + a redaction utility
- `BankingProvider` abstraction: live TrueLayer provider + a built-in demo provider
- Actual Budget client: lazy `@actual-app/api` integration + a built-in demo client
- Sync engine (dry-run / live) with duplicate detection and an interval scheduler
- Legacy config detection for the two upstream projects

### Demo mode

When no live credentials are configured (`TRUELAYER_CLIENT_ID` + `ACTUAL_SERVER_URL`),
the app runs in **demo mode** with a simulated bank and an in-memory Actual budget, so
you can complete the entire connect → map → dry-run → sync flow without any external
services. Set `DEMO_MODE=1` to force it, or provide live credentials to disable it.

## Development

Requires Node.js 20+.

```bash
npm install        # install dependencies
npm run dev        # start dev server with hot reload (http://localhost:3020)
npm test           # run tests
npm run lint       # lint
npm run typecheck  # type-check
npm run build      # compile to dist/
```

By default the server binds to `127.0.0.1:3020`. Set `APP_BIND_HOST=0.0.0.0` to
expose it on all interfaces. The data dir defaults to `/app/data`; override it when
running locally, e.g.:

```bash
APP_DATA_DIR=./data npm run dev
```

See [`.env.example`](./.env.example) for all configuration variables.

## Docker

```bash
docker compose -f compose.example.yml up -d
# then open http://localhost:3020/setup
```
