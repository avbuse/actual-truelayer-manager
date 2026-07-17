# AGENTS.md

## Project

`actual-truelayer-manager` is a Docker-first TypeScript/Node.js app (Fastify + SQLite,
server-rendered HTML) that syncs UK Open Banking transactions from TrueLayer into a
self-hosted Actual Budget instance. The full requirements live in
`actual-truelayer-manager-project-spec.md`; implementation is organised into the phases
in section 21 of that spec.

Current state: **Phase 0 scaffold** — Fastify server with `/health`, `/status`, and a
`/setup` landing page, environment/config loading with `_FILE` secret support, tests,
lint, and Docker packaging. Later phases (DB, encryption, Actual client, TrueLayer
provider, sync engine, wizard) are not yet implemented.

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
- Later phases expect a writable data dir at `/app/data` (`APP_DATA_DIR`). Locally it
  defaults to `/app/data`; override `APP_DATA_DIR` to a writable path (e.g. `./data`)
  when running outside a container.
