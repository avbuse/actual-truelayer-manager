# Project Spec: Actual TrueLayer Manager

## 1. Project Summary

Build a single, Docker-first application that combines the useful parts of:

- `jasmucrai/truelayer2actual`
- `sheppy/actual-truelayer-sync`

into one easier-to-manage product for syncing UK Open Banking transactions from TrueLayer into a self-hosted Actual Budget instance.

The product should remove the current pain points:

- no SSH tunnel required for setup
- no `docker run -it` setup flow
- no manual JSON editing for normal use
- no confusing split between `config.json`, `tokens.json`, and `state.json`
- no guessing whether sync is healthy
- no leaking banking secrets or OAuth tokens into logs

The desired user experience is:

```bash
docker compose up -d
```

Then open a web UI:

```text
http://server:3020/setup
```

Follow a guided wizard:

1. Connect to Actual Budget
2. Configure TrueLayer app credentials
3. Connect bank via OAuth
4. Select bank accounts/cards
5. Map them to Actual accounts
6. Run dry-run sync
7. Enable scheduled sync

---

# 2. Proposed Name

Working name:

```text
actual-truelayer-manager
```

Alternative final names:

- `actual-openbanking-sync`
- `actual-bank-sync`
- `actual-truelayer-bridge`

Use `actual-truelayer-manager` unless told otherwise.

---

# 3. Primary Goals

## 3.1 Core Product Goals

The application must:

1. Run as a single long-running Docker container.
2. Provide a small web UI for setup and management.
3. Sync transactions from TrueLayer-supported UK bank accounts/cards into Actual Budget.
4. Store state in SQLite, not editable JSON files.
5. Support manual sync and scheduled sync.
6. Support dry-run sync before live import.
7. Provide clear status, logs, health checks, and sync history.
8. Encrypt sensitive stored values.
9. Avoid exposing secrets in logs, UI, or error output.
10. Allow future banking providers to be added later through a provider abstraction.

## 3.2 Explicit Non-Goals for MVP

Do **not** build these in MVP unless core functionality is complete:

- multi-user SaaS accounts
- paid hosted version
- complex React SPA
- mobile app
- full accounting/reporting engine
- raw transaction dashboard beyond sync status
- Plaid/Yodlee support
- Home Assistant/MQTT export
- GoCardless/Nordigen support
- Enable Banking support

Keep it small and self-hosted.

---

# 4. Technology Requirements

## 4.1 Language

Use:

```text
TypeScript / Node.js
```

Reason: Actual Budget’s API is JavaScript-native via `@actual-app/api`.

## 4.2 Web Framework

Preferred:

```text
Fastify
```

Acceptable alternative:

```text
Hono
```

Do not use a heavyweight full-stack framework unless there is a strong reason.

## 4.3 UI

Use simple server-rendered pages.

Preferred options:

- plain HTML templates
- HTMX
- minimal CSS
- no React unless absolutely necessary

This should feel like a small self-hosted appliance, not a SaaS product.

## 4.4 Database

Use:

```text
SQLite
```

Database path:

```text
/app/data/sync.db
```

Use migrations.

Suggested libraries:

- `better-sqlite3`
- `drizzle-orm` with SQLite
- or simple SQL migrations if cleaner

## 4.5 Docker

Must provide:

```text
Dockerfile
compose.example.yml
.env.example
```

Container must support:

```bash
docker compose up -d
```

and be usable without local Node.js installed.

---

# 5. Source Repos to Learn From

The coding agent should inspect and reuse ideas from both repos, but the target product should be a new clean application.

## 5.1 `jasmucrai/truelayer2actual`

Use as reference for:

- Docker-first sync model
- one-shot sync mode
- built-in interval loop
- multi-bank support
- balance drift logging
- transaction import behaviour
- `@actual-app/api` usage

## 5.2 `sheppy/actual-truelayer-sync`

Use as reference for:

- easier TrueLayer redirect-page setup flow
- explicit `ACTUAL_SYNC_ID`
- bank account vs credit card distinction
- account mapping setup
- manual fallback docs
- v2 config/state structure

## 5.3 Do Not Blindly Copy

The new product should not just glue both projects together.

It should replace their CLI-first setup with:

- web setup wizard
- SQLite state
- clear management UI
- safer secret handling
- migration/import from old config files where possible

---

# 6. Application Architecture

Suggested repo layout:

```text
actual-truelayer-manager/
  src/
    app.ts
    server/
      routes/
        setup.routes.ts
        status.routes.ts
        sync.routes.ts
        logs.routes.ts
        health.routes.ts
      views/
        layout.ts
        setup.ts
        dashboard.ts
        logs.ts
    config/
      env.ts
      secrets.ts
    db/
      index.ts
      migrations/
      repositories/
        settings.repo.ts
        actual.repo.ts
        connections.repo.ts
        mappings.repo.ts
        syncRuns.repo.ts
    crypto/
      encrypt.ts
      redact.ts
    actual/
      actualClient.ts
      versionCheck.ts
      accounts.ts
      importer.ts
    providers/
      bankingProvider.ts
      truelayer/
        truelayerProvider.ts
        auth.ts
        accounts.ts
        transactions.ts
        tokens.ts
    sync/
      syncRunner.ts
      scheduler.ts
      dryRun.ts
      normalise.ts
    logging/
      logger.ts
      auditLog.ts
    migrations/
      legacyImport.ts
  test/
    unit/
    integration/
  Dockerfile
  compose.example.yml
  .env.example
  README.md
```

---

# 7. Provider Abstraction

Design the sync engine so that TrueLayer is the first provider, but not hardcoded throughout the system.

Create an interface similar to:

```ts
export interface BankingProvider {
  readonly name: string;

  createAuthUrl(input: CreateAuthUrlInput): Promise<string>;

  exchangeAuthCode(input: ExchangeAuthCodeInput): Promise<TokenSet>;

  refreshToken(input: RefreshTokenInput): Promise<TokenSet>;

  listAccounts(input: ListAccountsInput): Promise<BankAccount[]>;

  listTransactions(input: ListTransactionsInput): Promise<BankTransaction[]>;
}
```

Types:

```ts
export interface BankAccount {
  providerAccountId: string;
  displayName: string;
  accountType: "transaction" | "savings" | "credit_card" | "unknown";
  currency: string;
  iban?: string;
  sortCode?: string;
  accountNumberLast4?: string;
}

export interface BankTransaction {
  providerTransactionId: string;
  providerAccountId: string;
  bookedDate: string;
  description: string;
  amountMinor: number;
  currency: string;
  merchantName?: string;
  raw?: unknown;
}
```

The Actual-specific import logic must live outside the TrueLayer provider.

---

# 8. Configuration Requirements

The app must support both environment-driven config and UI-managed config.

## 8.1 Environment Variables

Required or supported environment variables:

```env
APP_BASE_URL=http://localhost:3020
APP_BIND_HOST=127.0.0.1
APP_PORT=3020

APP_ENCRYPTION_KEY=
APP_ENCRYPTION_KEY_FILE=

ACTUAL_SERVER_URL=
ACTUAL_PASSWORD=
ACTUAL_PASSWORD_FILE=
ACTUAL_ENCRYPTION_PASSWORD=
ACTUAL_ENCRYPTION_PASSWORD_FILE=
ACTUAL_SYNC_ID=

TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=
TRUELAYER_CLIENT_SECRET_FILE=
TRUELAYER_REDIRECT_MODE=manual
TRUELAYER_CALLBACK_URL=

SYNC_INTERVAL_HOURS=0
SYNC_OVERLAP_DAYS=3
LOG_LEVEL=info
```

## 8.2 Secret File Support

For every sensitive environment variable, support `_FILE` equivalent.

Example:

```env
ACTUAL_PASSWORD_FILE=/run/secrets/actual_password
TRUELAYER_CLIENT_SECRET_FILE=/run/secrets/truelayer_client_secret
APP_ENCRYPTION_KEY_FILE=/run/secrets/app_encryption_key
```

If both direct value and `_FILE` are provided, fail fast with a clear error.

## 8.3 Sensitive Values

Sensitive:

- `APP_ENCRYPTION_KEY`
- `ACTUAL_PASSWORD`
- `ACTUAL_ENCRYPTION_PASSWORD`
- `TRUELAYER_CLIENT_SECRET`
- TrueLayer access tokens
- TrueLayer refresh tokens
- OAuth auth code
- full OAuth callback URLs containing `code=`

These must not be logged.

---

# 9. SQLite Schema Requirements

Use SQLite database:

```text
/app/data/sync.db
```

Minimum tables are listed below.

## 9.1 `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
```

## 9.2 `settings`

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 9.3 `actual_config`

```sql
CREATE TABLE actual_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  server_url TEXT NOT NULL,
  sync_id TEXT NOT NULL,
  password_encrypted TEXT,
  encryption_password_encrypted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Passwords may be omitted from DB if provided via env.

## 9.4 `bank_connections`

```sql
CREATE TABLE bank_connections (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  connection_type TEXT NOT NULL,
  status TEXT NOT NULL,
  consent_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`connection_type` values:

```text
bank_account
credit_card
mixed
unknown
```

`status` values:

```text
setup_pending
active
reauth_required
disabled
error
```

## 9.5 `provider_tokens`

```sql
CREATE TABLE provider_tokens (
  connection_id TEXT PRIMARY KEY,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TEXT,
  scope TEXT,
  token_type TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (connection_id) REFERENCES bank_connections(id)
);
```

## 9.6 `provider_accounts`

```sql
CREATE TABLE provider_accounts (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  currency TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_account_id),
  FOREIGN KEY (connection_id) REFERENCES bank_connections(id)
);
```

## 9.7 `account_mappings`

```sql
CREATE TABLE account_mappings (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  actual_account_id TEXT NOT NULL,
  actual_account_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_successful_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(connection_id, provider_account_id),
  FOREIGN KEY (connection_id) REFERENCES bank_connections(id)
);
```

## 9.8 `sync_runs`

```sql
CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);
```

`mode` values:

```text
dry_run
live
scheduled
manual
```

`status` values:

```text
running
success
partial
failed
cancelled
```

## 9.9 `sync_run_items`

```sql
CREATE TABLE sync_run_items (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  actual_account_id TEXT NOT NULL,
  provider_transaction_id TEXT,
  booked_date TEXT,
  amount_minor INTEGER,
  currency TEXT,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id)
);
```

`status` values:

```text
fetched
would_import
imported
duplicate
skipped
failed
```

## 9.10 `imported_transactions`

```sql
CREATE TABLE imported_transactions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  actual_account_id TEXT NOT NULL,
  booked_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  sync_run_id TEXT NOT NULL,
  UNIQUE(provider, provider_account_id, provider_transaction_id)
);
```

---

# 10. Encryption Requirements

Sensitive values stored in SQLite must be encrypted.

Use:

```text
AES-256-GCM
```

Encryption key source:

```env
APP_ENCRYPTION_KEY
```

or:

```env
APP_ENCRYPTION_KEY_FILE
```

Requirements:

1. Key must be at least 32 bytes after decoding.
2. Support base64 or raw string, but document clearly.
3. Each encrypted value must use a unique nonce/IV.
4. Store encrypted values in a self-describing format, for example:

```text
v1:gcm:<base64_iv>:<base64_auth_tag>:<base64_ciphertext>
```

5. If encryption key is missing and the app needs to store tokens, setup must refuse to continue.
6. Do not silently store tokens plaintext.

---

# 11. Web UI Requirements

## 11.1 General UI Principles

The UI should be boring and clear.

No fancy frontend framework required.

Pages:

```text
/setup
/dashboard
/connections
/mappings
/logs
```

## 11.2 Setup Wizard

The setup wizard must have these steps:

### Step 1: Actual Budget Connection

Fields:

```text
Actual server URL
Actual password
Actual sync ID
Optional Actual E2E encryption password
```

Actions:

```text
Test connection
Save
```

Validation:

- server reachable
- password works
- sync ID appears valid
- API version is compatible, or warns clearly

### Step 2: TrueLayer App Config

Fields:

```text
TrueLayer client ID
TrueLayer client secret
Redirect mode
```

Redirect modes:

```text
manual_redirect_page
direct_callback
```

Default:

```text
manual_redirect_page
```

Manual redirect URI:

```text
https://console.truelayer.com/redirect-page
```

Direct callback example:

```text
https://actual-sync.example.com/oauth/callback
```

### Step 3: Add Bank Connection

User chooses:

```text
Bank account
Credit card
```

The app generates an OAuth URL.

Manual mode:

1. User clicks auth URL.
2. User authenticates with bank.
3. User is redirected to TrueLayer console redirect page.
4. User copies/pastes the final redirect URL into the app.
5. App extracts `code`.
6. App exchanges `code` for tokens.

Direct callback mode:

1. User clicks auth URL.
2. User authenticates with bank.
3. TrueLayer redirects to app callback.
4. App exchanges code automatically.

### Step 4: Account Discovery

After token exchange:

- list TrueLayer accounts/cards
- list Actual accounts
- allow dropdown mapping

Example:

```text
Lloyds Current Account  ->  Actual: Lloyds Current
Lloyds Savings          ->  Actual: Lloyds Savings
Lloyds Credit Card      ->  Actual: Lloyds Credit Card
```

### Step 5: Dry Run

Button:

```text
Run dry-run sync
```

Show summary:

```text
Fetched: 24
Would import: 18
Duplicates: 6
Skipped: 0
Failed: 0
Balance drift: £0.00
```

### Step 6: Enable Sync

Allow:

```text
Manual only
Every 6 hours
Every 12 hours
Daily
Custom interval in hours
```

The schedule can map to `SYNC_INTERVAL_HOURS`.

## 11.3 Dashboard

Dashboard must show:

```text
Actual Budget
  Status: connected
  Server: http://actual-budget:5006
  Sync ID: abc...

TrueLayer Connections
  Lloyds Personal
    Status: active
    Consent expires: 2026-10-15
    Last sync: today 08:00
    Next sync: today 14:00
    Accounts mapped: 2

Last Sync
  Status: success
  Fetched: 24
  Imported: 18
  Duplicates: 6
  Failed: 0

Actions
  Sync now
  Dry run
  Reconnect bank
  Edit mappings
  View logs
  Export backup
```

---

# 12. API Requirements

## 12.1 Health Endpoint

```http
GET /health
```

Returns:

```json
{
  "status": "ok"
}
```

No secrets. No external dependency check required.

## 12.2 Status Endpoint

```http
GET /status
```

Returns:

```json
{
  "actual": {
    "status": "ok",
    "server_url": "http://actual-budget:5006"
  },
  "connections": [
    {
      "id": "conn_123",
      "provider": "truelayer",
      "display_name": "Lloyds Personal",
      "status": "active",
      "consent_expires_at": "2026-10-15T00:00:00Z",
      "mapped_accounts": 2
    }
  ],
  "sync": {
    "last_sync_at": "2026-07-17T08:00:00Z",
    "last_result": "success",
    "last_imported_count": 18,
    "next_sync_at": "2026-07-17T14:00:00Z"
  }
}
```

## 12.3 Sync Now

```http
POST /sync-now
```

Body:

```json
{
  "mode": "live"
}
```

or:

```json
{
  "mode": "dry_run"
}
```

Must return a sync run ID.

## 12.4 Sync Run Detail

```http
GET /sync-runs/:id
```

Returns detailed sync result.

## 12.5 Logs

```http
GET /logs
```

Return recent application logs with secrets redacted.

---

# 13. Sync Engine Requirements

## 13.1 Sync Algorithm

For each enabled connection:

1. Load encrypted token.
2. Decrypt token.
3. Refresh token if needed.
4. Save refreshed token encrypted.
5. Load enabled account mappings.
6. For each mapping:
   - determine start date:
     - if never synced: now minus `SYNC_DAYS_LOOKBACK`, default 7
     - else: `last_successful_sync_at - SYNC_OVERLAP_DAYS`
   - fetch provider transactions
   - normalise to Actual import format
   - check imported transaction table
   - import into Actual unless dry-run
   - record item status
7. Update `last_successful_sync_at` only after account sync succeeds.
8. Create `sync_runs` and `sync_run_items` records.
9. Return summary.

## 13.2 Overlap Window

Support:

```env
SYNC_OVERLAP_DAYS=3
```

Purpose: avoid missing transactions that appear late or are adjusted after initial booking.

## 13.3 Dry Run

Dry-run must:

- fetch transactions
- normalise transactions
- check duplicates
- validate Actual account mapping
- not import into Actual
- record what would happen

## 13.4 Duplicate Handling

Track imported transaction IDs in `imported_transactions`.

Unique key:

```text
provider + provider_account_id + provider_transaction_id
```

If provider transaction ID is missing, use a deterministic fallback hash based on:

```text
provider
provider_account_id
date
amount
description
```

But mark it as fallback-derived.

## 13.5 Balance Drift

If available from TrueLayer and Actual:

- compare provider balance vs Actual account balance
- log warning if drift exceeds configurable threshold

Default threshold:

```env
BALANCE_DRIFT_WARNING_MINOR=100
```

Meaning £1.00 for GBP.

Do not block sync because of drift.

---

# 14. Actual Budget Requirements

## 14.1 Actual API

Use `@actual-app/api`.

The app must handle:

- server URL
- password
- sync ID
- optional encryption password
- account listing
- transaction import

## 14.2 Version Compatibility

On startup or Actual connection test:

1. query Actual server version if possible
2. check compatible `@actual-app/api` version
3. if mismatch is fatal, refuse to sync with a clear error

Example error:

```text
Actual server version is 25.7.0 but bundled @actual-app/api is 25.6.1.
These versions may be incompatible.
Use an image built for Actual 25.7.0 or update the bundled API package.
```

## 14.3 Actual Account Listing

The setup wizard must show Actual accounts in mapping dropdowns.

---

# 15. TrueLayer Requirements

## 15.1 Supported Modes

MVP must support TrueLayer only.

Must support:

```text
bank accounts
credit cards
```

## 15.2 OAuth Flow

Support two modes:

### Manual Redirect Page Mode

Default mode.

Redirect URI:

```text
https://console.truelayer.com/redirect-page
```

The app generates the auth URL. User authenticates and pastes the final redirect URL back into the UI.

The app extracts:

```text
code
state
```

from the pasted URL.

### Direct Callback Mode

Optional advanced mode.

Callback endpoint:

```http
GET /oauth/truelayer/callback
```

The app receives `code` and `state` directly.

## 15.3 Token Refresh

The app must refresh tokens automatically before sync.

If refresh fails:

- mark connection as `reauth_required`
- do not keep retrying aggressively
- show clear dashboard warning
- allow “Reconnect bank”

## 15.4 Consent Expiry

If TrueLayer exposes consent expiry, store and display it.

Warn when expiring within:

```env
CONSENT_EXPIRY_WARNING_DAYS=14
```

---

# 16. Security Requirements

This is a finance application. Security is not optional.

## 16.1 Logging

Never log:

- access tokens
- refresh tokens
- client secrets
- Actual password
- encryption password
- full OAuth callback URLs containing `code`
- raw request headers
- raw transaction payloads by default

Implement a redaction utility and use it everywhere.

Redact patterns:

```text
access_token=...
refresh_token=...
client_secret=...
code=...
ACTUAL_PASSWORD
TRUELAYER_CLIENT_SECRET
Authorization: Bearer ***
```

## 16.2 UI Redaction

Secret fields should display as:

```text
••••••••
```

Never render stored secret values.

## 16.3 Bind Address

Default bind host:

```env
APP_BIND_HOST=127.0.0.1
```

Do not expose publicly by default.

For Docker examples, bind to localhost unless explicitly changed:

```yaml
ports:
  - "127.0.0.1:3020:3020"
```

## 16.4 Authentication

MVP may rely on reverse-proxy auth, but support at least one simple built-in option:

```env
APP_BASIC_AUTH_USER=
APP_BASIC_AUTH_PASSWORD=
APP_BASIC_AUTH_PASSWORD_FILE=
```

If exposed beyond localhost, README must strongly recommend auth.

## 16.5 Backup Warning

Any backup/export feature must warn:

```text
The database contains encrypted banking access tokens.
Keep the encryption key and database secure.
A database backup plus encryption key can grant access to bank transaction data.
```

## 16.6 Plaintext Secret Refusal

If the app needs to persist tokens and `APP_ENCRYPTION_KEY` is missing, setup must fail.

Do not fall back to plaintext.

---

# 17. Docker Requirements

## 17.1 Example Compose

Provide:

```yaml
services:
  actual-truelayer-manager:
    image: ghcr.io/YOUR_ORG/actual-truelayer-manager:latest
    container_name: actual-truelayer-manager
    restart: unless-stopped
    ports:
      - "127.0.0.1:3020:3020"
    environment:
      APP_BIND_HOST: "0.0.0.0"
      APP_PORT: "3020"
      APP_BASE_URL: "http://localhost:3020"
      ACTUAL_SERVER_URL: "http://actual-budget:5006"
      SYNC_INTERVAL_HOURS: "6"
      SYNC_OVERLAP_DAYS: "3"
      LOG_LEVEL: "info"
    volumes:
      - ./data:/app/data
```

Note: container bind host must be `0.0.0.0` inside Docker, but host port should be bound to `127.0.0.1`.

## 17.2 Secret File Example

Provide example:

```yaml
services:
  actual-truelayer-manager:
    image: ghcr.io/YOUR_ORG/actual-truelayer-manager:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3020:3020"
    environment:
      APP_BIND_HOST: "0.0.0.0"
      APP_PORT: "3020"
      ACTUAL_SERVER_URL: "http://actual-budget:5006"
      ACTUAL_PASSWORD_FILE: "/run/secrets/actual_password"
      TRUELAYER_CLIENT_SECRET_FILE: "/run/secrets/truelayer_client_secret"
      APP_ENCRYPTION_KEY_FILE: "/run/secrets/app_encryption_key"
    secrets:
      - actual_password
      - truelayer_client_secret
      - app_encryption_key
    volumes:
      - ./data:/app/data

secrets:
  actual_password:
    file: ./secrets/actual_password
  truelayer_client_secret:
    file: ./secrets/truelayer_client_secret
  app_encryption_key:
    file: ./secrets/app_encryption_key
```

## 17.3 Healthcheck

Dockerfile or compose should include:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3020/health"]
  interval: 30s
  timeout: 5s
  retries: 3
```

Use `curl` if included instead of `wget`.

---

# 18. Migration Requirements

The app should support importing existing config from both source projects.

## 18.1 Detect `jasmucrai/truelayer2actual`

Expected files:

```text
/app/data/config.json
/app/data/tokens.json
```

## 18.2 Detect `sheppy/actual-truelayer-sync`

Expected files:

```text
/app/data/config.json
/app/data/state.json
```

## 18.3 Migration Flow

If legacy files exist, UI should show:

```text
Existing configuration detected.
Import into new database?

[Backup and import]
[Ignore]
```

On import:

1. create backup directory:

```text
/app/data/migrations/backup-YYYYMMDD-HHMMSS/
```

2. copy original files into backup
3. parse config/state/tokens
4. import connections, tokens, mappings where possible
5. show summary
6. never delete originals automatically

If parsing fails, show a clear error and leave files untouched.

---

# 19. Testing Requirements

## 19.1 Unit Tests

Test:

- encryption/decryption
- redaction
- env parsing
- `_FILE` secret loading
- TrueLayer URL generation
- OAuth callback URL parsing
- transaction normalisation
- duplicate detection
- sync date window calculation
- SQLite migrations

## 19.2 Integration Tests

Mock:

- TrueLayer API
- Actual Budget API

Test:

- setup flow
- token exchange flow
- token refresh flow
- dry-run sync
- live sync import
- failed token refresh marks connection `reauth_required`
- Actual API mismatch causes clear error

## 19.3 Security Tests

Test that logs do not include:

- `access_token`
- `refresh_token`
- `client_secret`
- OAuth `code`
- Actual password

## 19.4 Docker Test

Must be able to run:

```bash
docker compose -f compose.example.yml config
docker build -t actual-truelayer-manager:test .
```

If feasible, provide a smoke test:

```bash
docker run --rm -p 127.0.0.1:3020:3020 actual-truelayer-manager:test
curl http://127.0.0.1:3020/health
```

Expected:

```json
{"status":"ok"}
```

---

# 20. MVP Acceptance Criteria

MVP is complete when all of the following are true:

## 20.1 Deployment

- `docker build` succeeds
- `docker compose up -d` starts the app
- `/health` returns OK
- app stores persistent data under `/app/data`

## 20.2 Setup

- user can configure Actual Budget from web UI
- app can test Actual connection
- user can configure TrueLayer credentials
- app can generate TrueLayer auth URL
- manual redirect-page OAuth flow works
- app can exchange pasted redirect URL for tokens
- app stores encrypted tokens in SQLite

## 20.3 Mapping

- app lists provider accounts/cards
- app lists Actual accounts
- user can map provider accounts to Actual accounts
- mappings persist

## 20.4 Sync

- dry-run sync works and imports nothing
- live sync imports transactions into Actual
- duplicate transactions are not repeatedly imported
- sync result is recorded
- dashboard shows last sync status/counts

## 20.5 Management

- user can manually trigger sync
- user can see connection status
- user can see if reauth is required
- user can view redacted logs
- user can edit mappings

## 20.6 Security

- tokens are encrypted at rest
- setup refuses to store tokens without encryption key
- logs redact secrets
- UI redacts secrets
- Docker binds host port to localhost by default
- README warns about protecting DB and encryption key

---

# 21. Recommended Development Phases

## Phase 0: Repo Scaffold

Deliverables:

- TypeScript project
- Fastify server
- health route
- Dockerfile
- compose example
- test framework

Acceptance:

```bash
npm test
docker build -t actual-truelayer-manager:test .
```

## Phase 1: Config, Secrets, Encryption

Deliverables:

- env parser
- `_FILE` secret support
- AES-256-GCM encryption utility
- redaction utility
- tests

Acceptance:

- secrets can be loaded from file
- encrypted values decrypt correctly
- logs redact secrets

## Phase 2: SQLite Migrations

Deliverables:

- database module
- migrations
- repositories
- migration tests

Acceptance:

- `/app/data/sync.db` created
- all tables created
- migrations are idempotent

## Phase 3: Actual Budget Client

Deliverables:

- Actual connection test
- account listing
- version compatibility warning/error
- tests using mocked Actual API

Acceptance:

- setup UI/API can verify Actual config
- accounts available for mapping

## Phase 4: TrueLayer Provider

Deliverables:

- auth URL generation
- pasted redirect URL parser
- token exchange
- token refresh
- account listing
- transaction listing
- mocked tests

Acceptance:

- manual redirect OAuth flow works against mocks
- tokens stored encrypted

## Phase 5: Setup Wizard

Deliverables:

- setup pages
- Actual config form
- TrueLayer config form
- add connection flow
- account mapping page

Acceptance:

- user can complete full setup through browser

## Phase 6: Sync Engine

Deliverables:

- dry-run sync
- live sync
- duplicate handling
- sync run records
- dashboard status

Acceptance:

- dry run shows would-import counts
- live sync imports to Actual mock
- duplicate second run imports zero new transactions

## Phase 7: Scheduler and Management UI

Deliverables:

- interval scheduler
- dashboard
- connection status
- reauth state
- redacted logs page
- sync now button

Acceptance:

- scheduled sync runs on interval
- manual sync works
- dashboard reflects results

## Phase 8: Legacy Import

Deliverables:

- detect old repo files
- backup originals
- import what can be imported
- show summary

Acceptance:

- sample legacy configs import into SQLite
- failed import leaves files untouched

---

# 22. Documentation Requirements

README must include:

1. What the app does
2. Security warning
3. Docker quick start
4. TrueLayer setup guide
5. Actual Budget setup guide
6. Environment variables
7. Secret file usage
8. Reverse proxy notes
9. Backup/restore notes
10. Troubleshooting

Must explicitly explain:

```text
Self-hosting this app does not mean bank data never touches TrueLayer.
TrueLayer is still the Open Banking provider used to access bank data.
```

Must include:

```text
Protect /app/data/sync.db and APP_ENCRYPTION_KEY.
Together, they can expose banking access tokens and transaction data.
```

---

# 23. Coding Standards

- TypeScript strict mode on.
- No `any` unless justified.
- Small modules.
- Explicit errors.
- Tests for security-sensitive code.
- No raw console logging of request bodies.
- No logging secrets.
- Prefer dependency injection for provider clients to ease testing.
- Keep UI simple.
- Avoid unnecessary dependencies.

---

# 24. Final Instruction to Coding Agent

Build this as a clean new product, not a messy merge.

Use `jasmucrai/truelayer2actual` mainly for sync behaviour and Docker ideas.

Use `sheppy/actual-truelayer-sync` mainly for onboarding/setup flow and explicit Actual sync ID handling.

The end state should be:

```text
docker compose up -d
open browser
connect Actual
connect TrueLayer
map accounts
dry run
sync
done
```

If the implementation starts needing SSH tunnels, interactive Docker TTY commands, or manual JSON editing for normal setup, it is drifting away from the spec.
