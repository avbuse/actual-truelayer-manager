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

Run just the manager:

```bash
docker compose -f compose.example.yml up -d
# then open http://localhost:3020/setup
```

Run the manager **and** a self-hosted Actual Budget server in one stack:

```bash
docker compose -f compose.actual-budget.yml up -d
# Actual Budget UI:  http://localhost:5006
# Manager UI:        http://localhost:3020/setup
```

The manager reaches Actual over the compose network at `http://actual-server:5006`.
Provide `TRUELAYER_*` and `ACTUAL_*` credentials in the compose file to switch from
demo mode to live sync.

### Adding to an existing Actual Budget compose stack

If Actual Budget is already running in another compose project, add the manager
with the published GHCR image (no local `build: .`) via
[`compose.actual-budget-companion.yml`](./compose.actual-budget-companion.yml):

```bash
docker compose -f /path/to/your-actual-compose.yml \
               -f compose.actual-budget-companion.yml up -d
# Manager UI: http://localhost:3020/setup
```

The companion file assumes your Actual service is named `actual-server` and sets
`ACTUAL_SERVER_URL=http://actual-server:5006`. If your service uses another name
(e.g. `actual-budget`), change that hostname in the companion file (and
`depends_on`) to match. The UI is bound to `127.0.0.1:3020` by default and
`/app/data` is persisted under `./actual-truelayer-manager-data`.

Do **not** commit real Actual / TrueLayer / banking secrets in compose files.
Prefer `*_FILE` mounts or runtime injection from Infisical (or equivalent)
rather than plaintext `.env` values checked into git.

## Going live

Demo mode is great for clicking through the flow, but a real TrueLayer → Actual sync
needs a few things in place. See [`.env.example`](./.env.example) for every variable.

1. **Set a durable encryption key.** Live mode refuses to start (and refuses to
   connect a real bank) without `APP_ENCRYPTION_KEY` (or `APP_ENCRYPTION_KEY_FILE`).
   Generate one with `openssl rand -base64 32`. This key encrypts banking tokens at
   rest — back it up separately from the database.

2. **Choose demo vs. live.** The app auto-detects live mode once TrueLayer + Actual
   credentials are present. You can force it either way with `DEMO_MODE=0` (live) or
   `DEMO_MODE=1` (demo). TrueLayer credentials can come from the environment
   (`TRUELAYER_CLIENT_ID` / `TRUELAYER_CLIENT_SECRET`) **or** from the setup wizard —
   both now drive the live provider.

3. **Start against the TrueLayer sandbox.** Set `TRUELAYER_USE_SANDBOX=true` for the
   first end-to-end test; the provider then talks to `auth.truelayer-sandbox.com` /
   `api.truelayer-sandbox.com`. Override the endpoints directly with
   `TRUELAYER_AUTH_BASE_URL` / `TRUELAYER_API_BASE_URL` if needed.

4. **Install a matching `@actual-app/api`.** It ships as an optional dependency and is
   loaded lazily. Its major.minor line should match your Actual server version; the
   Actual connection test warns when they differ. Pin it in `package.json` /
   rebuild the image if you upgrade the server.

5. **Protect the UI.** The server binds to `127.0.0.1` by default. If you expose it,
   set `APP_BASIC_AUTH_USER` + `APP_BASIC_AUTH_PASSWORD` (built-in Basic Auth; the
   `/health` endpoint stays open for container health checks) and/or put it behind an
   authenticating reverse proxy.

Tokens are refreshed automatically before each sync. If a bank's consent expires or a
refresh fails, the connection is flagged `reauth_required` and the dashboard shows a
warning — use **Reconnect bank** on the Connections page to re-authorise.

> **Protect `sync.db` and `APP_ENCRYPTION_KEY`.** Together they can expose banking
> access tokens and transaction data. A database backup is only as safe as the key.

## Container images / CI

On every push to `main` (and on tags) the [`Build Docker image`](./.github/workflows/docker-build.yml)
GitHub Actions workflow builds and publishes the image to the GitHub Container Registry
at `ghcr.io/<owner>/actual-truelayer-manager`. Pull requests build the image without
pushing, as a check.

The image is **multi-arch**, published for:

- `linux/amd64` — regular x86-64 servers
- `linux/arm64` — 64-bit Raspberry Pi OS (Pi 3/4/5) and other aarch64 hosts
- `linux/arm/v7` — 32-bit Raspberry Pi OS (armhf)

Docker automatically pulls the correct architecture, so on a Raspberry Pi you can simply
`docker compose up -d` (or `docker pull ghcr.io/<owner>/actual-truelayer-manager`) with no
extra flags.
