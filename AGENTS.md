# AGENTS.md

## Project

`actual-truelayer-manager` is a Docker-first TypeScript/Node.js app (Fastify + SQLite,
server-rendered HTML) that syncs UK Open Banking transactions from TrueLayer into a
self-hosted Actual Budget instance. The full requirements live in
`actual-truelayer-manager-project-spec.md`; implementation is organised into the phases
in section 21 of that spec.

Current state: **Working prototype** covering spec phases 0–8 — Fastify server, SQLite
persistence (better-sqlite3) with migrations and repositories, AES-256-GCM encryption +
redaction, a `BankingProvider` abstraction (TrueLayer + built-in demo), an Actual client
(lazy `@actual-app/api` + built-in demo), a sync engine (dry-run/live/dedupe), an interval
scheduler, and a server-rendered UI (setup wizard, dashboard, connections, mappings, logs).

## Commands

Standard npm scripts (see `package.json`):

- `npm run dev` — dev server with hot reload (`tsx watch`)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run the compiled server
- `npm test` — run Vitest suite
- `npm run lint` / `npm run typecheck` — ESLint / `tsc --noEmit`

## Cursor Cloud specific instructions

- Dependencies are installed by the update script (`npm install`); no extra system
  packages are required for the Node app.
- The app binds to `APP_BIND_HOST` (default `127.0.0.1`). When you need to reach the
  dev server from outside the process (e.g. the Desktop browser), start it with
  `APP_BIND_HOST=0.0.0.0`, e.g. `APP_BIND_HOST=0.0.0.0 APP_PORT=3020 npm run dev`.
  The default port is `3020`.
- Docker is **not** installed in the base Cloud VM. The `Dockerfile` /
  `compose.example.yml` are valid but cannot be built/run here without first installing
  Docker; validate the app with `npm run dev` instead.
- The data dir defaults to `/app/data` (`APP_DATA_DIR`), which is not writable in the
  Cloud VM. Always override it, e.g. `APP_DATA_DIR=/workspace/data npm run dev`. The
  SQLite file lives at `APP_DB_PATH` (defaults to `<dataDir>/sync.db`); `/workspace/data`
  is gitignored.
- **Demo mode**: when no live credentials are set (`TRUELAYER_CLIENT_ID` + `ACTUAL_SERVER_URL`),
  the app runs in demo mode using a simulated bank + in-memory Actual budget, so the whole
  setup/sync flow is clickable without external services. Force it with `DEMO_MODE=1`. In
  demo mode an ephemeral encryption key is auto-created at `<dataDir>/demo-encryption.key`.
- Live Actual sync needs the `@actual-app/api` package. It is declared under
 `optionalDependencies` (so demo mode/tests still work if it can't be built, e.g. armv7
 under emulation) and is loaded lazily. Its major.minor should match the Actual server
 version; the Actual connection test warns on a mismatch (`src/actual/versionCheck.ts`).
- `better-sqlite3` is a native module installed via prebuilt binary during `npm install`.
  The `Dockerfile` uses a Debian (glibc) base and includes `python3`/`make`/`g++` in the
  build stage so `better-sqlite3` builds reliably in the image.
- Docker is not installed in the base VM. To verify image builds locally, install Docker
  and run `dockerd` with `storage-driver: fuse-overlayfs` and `containerd-snapshotter: false`
  plus legacy iptables (Docker 29 defaults otherwise break in this environment).
- Three compose files exist, all pulling `ghcr.io/avbuse/actual-truelayer-manager:latest`
  (no local `build: .` required for operators):
  `compose.example.yml` (manager only), `compose.actual-budget.yml` (manager +
  `actualbudget/actual-server`; manager reaches Actual at `http://actual-server:5006`),
  and `compose.actual-budget-companion.yml` (add the manager to an existing Actual stack).
- CI: `.github/workflows/docker-build.yml` builds the image on PRs and builds+pushes to
  GHCR on pushes to `main`/tags. It builds a **multi-arch** manifest for
  `linux/amd64,linux/arm64,linux/arm/v7` (Raspberry Pi 64-bit and 32-bit) via QEMU.
- To build arm images locally you must mount binfmt_misc first
  (`sudo mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc`), then register QEMU
  (`docker run --privileged --rm tonistiigi/binfmt --install arm64,arm`) and use a
  `docker-container` buildx builder. `better-sqlite3` compiles from source under emulation
  (the Dockerfile's build stage has the needed toolchain), so arm builds are slower.
