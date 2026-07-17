# actual-truelayer-manager

> An experiment in AI Coding

A single, Docker-first application for syncing UK Open Banking transactions from
[TrueLayer](https://truelayer.com/) into a self-hosted
[Actual Budget](https://actualbudget.org/) instance.

The full product specification lives in
[`actual-truelayer-manager-project-spec.md`](./actual-truelayer-manager-project-spec.md).

## Status

**Phase 0 scaffold.** The runnable foundation is in place:

- Fastify HTTP server (TypeScript, strict mode)
- `GET /health` liveness endpoint
- `GET /status` machine-readable status document
- `GET /setup` server-rendered setup wizard landing page
- Environment/config loader with `_FILE` secret support
- Vitest test suite, ESLint, and Docker packaging

Later phases (SQLite, encryption, Actual Budget client, TrueLayer provider, sync
engine, and the full setup wizard) are described in the spec.

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
expose it on all interfaces. See [`.env.example`](./.env.example) for all
configuration variables.

## Docker

```bash
docker compose -f compose.example.yml up -d
# then open http://localhost:3020/setup
```
