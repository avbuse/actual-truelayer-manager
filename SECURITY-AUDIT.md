# Security Audit Report — actual-truelayer-manager

**Audit date:** 2026-07-17  
**Baseline commit:** `5484a5a` (`main` after merge of PR #6 — modernize deprecated deps / Vitest v4 / Node ≥22)  
**Scope:** Full repository review (auth, crypto, OAuth, SSR HTML, SQLite, Docker/CI, deps, docs)  
**Method:** Manual code review + `npm audit`  
**`npm audit`:** **0 vulnerabilities** (prod + dev)

## Executive summary

This is a self-hosted finance sync app. Crypto-at-rest (AES-256-GCM), token plaintext refusal, HTML escaping, and prepared SQL statements are in good shape. The largest gaps are **missing application authentication** (required by the project spec §16.4 but unimplemented), **CSRF**, **OAuth state handling**, and **SSRF via the Actual server URL** — especially dangerous if the UI is reachable beyond localhost.

Default local bind is `127.0.0.1` and compose host ports are localhost-bound, which reduces default exposure. The Docker image still listens on `0.0.0.0` inside the container (correct for Docker networking), so any mis-published host port or LAN exposure becomes fully unauthenticated admin access.

Severity scale used: **urgent → high → medium → low → informational**.

| Severity | Count |
|---|---|
| urgent | 0 |
| high | 2 |
| medium | 7 |
| low | 6 |
| informational | 6 |

---

## Findings

### HIGH-01 — No application authentication on UI/API routes

**Severity:** high  
**Status:** confirmed gap vs spec §16.4 (`APP_BASIC_AUTH_*` specified, not implemented)

**Evidence**
- `src/app.ts` registers all routes after `@fastify/formbody` only — no auth/`preHandler`.
- Sensitive surfaces: `/setup/*`, `/sync-now`, `/connections/*`, `/mappings`, `/logs`, `/status`, `/logs.json`.
- `Dockerfile` sets `APP_BIND_HOST=0.0.0.0` (expected in-container).
- README documents `APP_BIND_HOST=0.0.0.0` without requiring auth.

**Impact**  
Anyone who can reach the HTTP port can change Actual/TrueLayer credentials, trigger live syncs, remount mappings, and read status/logs. Combined with HIGH-02 this becomes network pivoting.

**Agent-ready fix**

```text
Implement APP_BASIC_AUTH as specified in actual-truelayer-manager-project-spec.md §16.4.

Requirements:
1. Add config in src/config/env.ts for:
   - APP_BASIC_AUTH_USER
   - APP_BASIC_AUTH_PASSWORD / APP_BASIC_AUTH_PASSWORD_FILE (via existing readEnvOrFile)
2. In src/app.ts, register a global preHandler that:
   - Always allows GET /health unauthenticated
   - If APP_BASIC_AUTH_USER and password are set, require HTTP Basic Auth (constant-time compare)
   - If APP_BIND_HOST is 0.0.0.0 (or not loopback) AND auth is unset AND DEMO_MODE is false:
     either fail startup OR log a loud warning and refuse mutating routes
3. Document APP_BASIC_AUTH_* in .env.example and README; strongly warn that exposing beyond localhost without auth is unsafe.
4. Add unit tests for: unauthenticated 401 when configured; /health still 200; missing auth on non-loopback bind behavior.
Do not add a full session system — Basic Auth is enough for MVP.
```

---

### HIGH-02 — Actual server URL enables SSRF (unvalidated)

**Severity:** high (especially with HIGH-01)

**Evidence**
- `POST /setup/actual` accepts any `server_url` and stores it (`src/server/routes/setup.routes.ts`).
- `RealActualClient` passes it to `api.init({ serverURL })` (`src/actual/realActualClient.ts`).
- No scheme/host allowlist, no block of link-local / cloud metadata / private ranges.

**Impact**  
An attacker with UI access can make the process connect to internal hosts (e.g. `169.254.169.254`, LAN services, localhost sidecars), potentially exfiltrating or probing the deployment environment. Self-hosted Docker stacks often have rich internal networks.

**Agent-ready fix**

```text
Add validateActualServerUrl() and use it in POST /setup/actual before actualRepo.upsert.

Rules:
1. Parse with URL; allow only http: and https:
2. Reject URLs with username/password userinfo
3. Reject hostname literals: localhost, 127.0.0.0/8, ::1, 0.0.0.0, link-local 169.254.0.0/16, metadata hostnames
4. By default reject private RFC1918 ranges UNLESS env ALLOW_PRIVATE_ACTUAL_URL=1 (needed for Docker compose hostnames like http://actual-server:5006 — prefer allowing private hostnames that are DNS names on the compose network, or allowlist via ACTUAL_SERVER_URL_ALLOWLIST)
5. Persist only the normalized href
6. Unit-test reject/allow cases including compose hostname actual-server
Keep flash error user-facing when validation fails.
```

---

### MEDIUM-01 — No CSRF protection on state-changing POSTs

**Severity:** medium

**Evidence**  
HTML forms POST to `/sync-now`, `/setup/*`, `/connections/*`, `/mappings`, `/oauth/exchange` with no CSRF token. No Origin/Referer check.

**Impact**  
If the app is reachable from the user’s browser (localhost or LAN), a malicious site can trigger syncs or config changes via cross-site form POST.

**Agent-ready fix**

```text
Add lightweight CSRF defense without a heavy session framework:

Option A (preferred):
1. Generate a CSRF token at process start (or per-cookie session), store in httpOnly cookie + hidden form fields.
2. On all POST routes, require matching token.

Option B (faster MVP):
1. On unsafe methods, require Origin or Referer host to match APP_BASE_URL host.
2. Reject with 403 otherwise.
3. Document that browsers without Origin may need Option A.

Cover all POST routes under src/server/routes/. Add tests.
```

---

### MEDIUM-02 — Manual OAuth exchange ignores returned `state`

**Severity:** medium

**Evidence**
- `parseRedirectUrl` returns `state` (`src/providers/truelayer/auth.ts`).
- `POST /oauth/exchange` uses only `connection_id` from the form body + `parsed.code` — never verifies `parsed.state` against `oauth.state.<state>` (`src/server/routes/setup.routes.ts`).

**Impact**  
OAuth CSRF / login mix-up in manual redirect mode: an attacker-supplied auth code can be bound to an attacker-chosen `connection_id` hidden field.

**Agent-ready fix**

```text
In POST /oauth/exchange (src/server/routes/setup.routes.ts):
1. Require parsed.state from parseRedirectUrl
2. Look up connectionId = settings.get(`oauth.state.${parsed.state}`)
3. Require it equals body connection_id (or ignore body connection_id and use the looked-up id only)
4. Delete the oauth.state.* key after successful or failed exchange (see MEDIUM-03)
5. Add unit/integration test for mismatched/missing state rejection
```

---

### MEDIUM-03 — OAuth `state` values never expire and are not deleted

**Severity:** medium

**Evidence**
- State stored via `settings.set(\`oauth.state.${state}\`, connectionId)`.
- Callback reads it but never deletes it.
- `SettingsRepo` has no `delete` / TTL (`src/db/repositories/settings.repo.ts`).

**Impact**  
Stale or leaked state remains valid indefinitely; settings table accumulates reusable OAuth states.

**Agent-ready fix**

```text
1. Add SettingsRepo.delete(key) (and optionally deleteByPrefix)
2. Store oauth state as JSON: { connectionId, createdAt } OR use key oauth.state.<uuid> with separate oauth.state.<uuid>.created_at
3. On callback and /oauth/exchange: validate age <= 10 minutes, then delete state key immediately (success or failure)
4. Optionally sweep expired oauth.state.* on startup
5. Tests for expiry and single-use
```

---

### MEDIUM-04 — OAuth authorization `code` can appear in request logs

**Severity:** medium

**Evidence**
- Direct callback: `GET /oauth/truelayer/callback?code=...&state=...`
- Fastify redact paths cover tokens/headers but **not** `req.url` query strings (`src/app.ts`).

**Impact**  
Short-lived auth codes can land in container/stdout logs. Worse without PKCE (LOW-01).

**Agent-ready fix**

```text
In src/app.ts logger config, add a request serializer that redacts query params code, state, access_token, refresh_token from req.url (reuse redactString from src/crypto/redact.ts which already redacts code=).
Ensure default production logger (when enabled in src/index.ts) uses the same redaction.
Add a small unit test that a URL with ?code=secret is redacted when serialized.
```

---

### MEDIUM-05 — Container runtime runs as root

**Severity:** medium

**Evidence**  
`Dockerfile` runtime stage has no `USER`. Compose files set no `user:`, `cap_drop`, `read_only`, or `no-new-privileges`.

**Impact**  
Process compromise yields root inside the container and easier write access to mounted `./data`.

**Agent-ready fix**

```text
Dockerfile runtime stage:
1. RUN groupadd -r app && useradd -r -g app -u 10001 app
2. mkdir/chown /app/data to app
3. USER 10001:10001 (or app)
4. Ensure volume mount docs note host dir ownership

compose.example.yml + compose.actual-budget.yml:
- security_opt: ["no-new-privileges:true"]
- cap_drop: ["ALL"]
Verify healthcheck and better-sqlite3 still work as non-root.
```

---

### MEDIUM-06 — GitHub Actions pinned by mutable tags, not commit SHAs

**Severity:** medium

**Evidence**  
`.github/workflows/docker-build.yml` uses `actions/checkout@v5`, `docker/*-action@v4/v6/v7` while publishing to GHCR with `packages: write`.

**Impact**  
Compromised or retagged actions could inject into image builds on `main`/tags.

**Agent-ready fix**

```text
Pin every uses: action in .github/workflows/docker-build.yml to a full commit SHA (with version comment). Add Dependabot or Renovate config for github-actions ecosystem updates.
Do not broaden permissions; keep contents:read and packages:write only.
```

---

### MEDIUM-07 — Live secrets encouraged as plain compose `environment` values

**Severity:** medium

**Evidence**  
`compose.actual-budget.yml` documents secrets in `environment:` comments; README says to put credentials in the compose file.

**Impact**  
Secrets end up in compose files, shell history, `docker inspect`, and backups.

**Agent-ready fix**

```text
Update compose.actual-budget.yml and README to prefer *_FILE / Docker secrets for APP_ENCRYPTION_KEY, ACTUAL_PASSWORD, TRUELAYER_CLIENT_SECRET. Keep non-secret config as env vars. Show a short example mounting /run/secrets/...
```

---

### LOW-01 — TrueLayer OAuth lacks PKCE

**Severity:** low

**Evidence**  
`createAuthUrl` / `exchangeAuthCode` in `src/providers/truelayer/truelayerProvider.ts` omit `code_challenge` / `code_verifier`.

**Impact**  
Stolen auth codes are more useful to an attacker.

**Agent-ready fix**

```text
Implement S256 PKCE for TrueLayer:
1. Generate code_verifier per connection attempt; store with oauth state
2. Add code_challenge + code_challenge_method=S256 to auth URL
3. Send code_verifier on token exchange
4. Delete verifier with state after use
Confirm TrueLayer auth API supports PKCE for this app type before shipping.
```

---

### LOW-02 — Secret form posts silently drop values when encryptor is missing

**Severity:** low

**Evidence**  
`password ? enc?.encrypt(password) ?? null` and `if (clientSecret && services.encryptor)` in setup routes — UI still flashes success.

**Impact**  
User believes secrets were saved; live mode may later fail or appear “configured” incorrectly.

**Agent-ready fix**

```text
If POST /setup/actual or /setup/truelayer includes a secret field and services.encryptor is null, redirect with flash error requiring APP_ENCRYPTION_KEY. Do not claim success. Align with spec §16.6 plaintext refusal.
```

---

### LOW-03 — Redaction misses URL-embedded userinfo; raw Actual errors logged

**Severity:** low

**Evidence**
- `redactString` does not scrub `https://user:pass@host`.
- Setup logs `Actual connection test: ${test.message}` with raw client errors.

**Agent-ready fix**

```text
1. Extend redactString to replace URL userinfo with ***
2. In RealActualClient.testConnection, return generic message to UI/logs; keep detail only in structured debug if needed
3. Add redact unit tests for userinfo URLs
```

---

### LOW-04 — Mutable base/app image tags

**Severity:** low

**Evidence**  
`node:22-bookworm-slim`, compose `actualbudget/actual-server:latest`, app image `:latest`.

**Agent-ready fix**  
Pin Dockerfile base image digest; pin Actual server to a version tag (or digest) in compose examples.

---

### LOW-05 — PR builds write shared GHA BuildKit cache

**Severity:** low

**Evidence**  
`cache-to: type=gha,mode=max` runs on `pull_request` builds.

**Agent-ready fix**  
Only `cache-to` on trusted refs (`main`/tags); keep `cache-from` on PRs.

---

### LOW-06 — Docs/config drift for auth and Node version

**Severity:** low

**Evidence**
- Spec §16.4 documents `APP_BASIC_AUTH_*` but `.env.example` omits them.
- README says Node.js 20+; `package.json` requires `>=22`.

**Agent-ready fix**  
Update `.env.example` + README Node requirement to 22+; document Basic Auth env vars (even before HIGH-01 lands, as “planned/required when exposing”).

---

### INFORMATIONAL

| ID | Note |
|---|---|
| INFO-01 | `npm audit` clean after PR #6 (Vitest 4 / Vite 8 / Node ≥22). |
| INFO-02 | AES-256-GCM uses fresh 96-bit IVs + auth tags; format `v1:gcm:...` is sound (`src/crypto/encrypt.ts`). |
| INFO-03 | Provider tokens refuse plaintext persistence without encryptor (`ConnectionsRepo.saveTokens`). |
| INFO-04 | Repositories use parameterized SQL; SSR views generally use `escapeHtml` for user-controlled text. |
| INFO-05 | Compose examples bind host ports to `127.0.0.1` — good default. |
| INFO-06 | No hardcoded live secrets/tokens found in the repo; test fixtures use obvious dummy values. |

**Defense-in-depth notes (not scored as vulns):**
- Enum status values interpolated into HTML class attributes without allowlisting (`pill ${c.status}`) — low risk today because values are app-controlled; allowlist if you harden further.
- No security headers (`Content-Security-Policy`, `X-Frame-Options`, etc.) — consider `@fastify/helmet` once auth exists.
- `/status` and `/logs.json` expose operational metadata without auth — covered by HIGH-01.

---

## Suggested fix priority for a coding agent

Feed work in this order (each item can be a separate PR):

1. **HIGH-01** Basic Auth + bind/auth guard  
2. **HIGH-02** Actual URL validation / SSRF controls  
3. **MEDIUM-02 + MEDIUM-03** OAuth state verify + single-use/TTL (+ `SettingsRepo.delete`)  
4. **MEDIUM-01** CSRF (Origin check MVP or token)  
5. **MEDIUM-04** Request URL redaction for `code`/`state`  
6. **MEDIUM-05** Non-root Docker user + compose hardening  
7. **LOW-02 / LOW-03 / LOW-06** quick correctness/docs fixes  
8. **MEDIUM-06 / MEDIUM-07 / LOW-01 / LOW-04 / LOW-05** supply-chain and OAuth hardening  

---

## Out of scope / not tested

- Runtime penetration of a live TrueLayer/Actual deployment  
- Full dependency SBOM / malware analysis beyond `npm audit`  
- Formal threat model workshop  
- Browser-based CSRF PoC against a running instance  

---

## Positive controls observed

- Encryption key via env or `*_FILE`; demo key file mode `0600`  
- Log buffer redacts via `redactString` before `/logs`  
- Fastify logger redacts common secret object paths  
- Healthcheck hits localhost only  
- Spec already anticipates Basic Auth, plaintext refusal, and localhost bind defaults  
