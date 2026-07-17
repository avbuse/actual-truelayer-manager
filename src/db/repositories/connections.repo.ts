import type { Encryptor } from "../../crypto/encrypt.js";
import type { Db } from "../index.js";
import type {
  BankConnectionRow,
  ConnectionStatus,
  ConnectionType,
  ProviderAccountRow,
  TokenSetRecord,
} from "../types.js";

export interface CreateConnectionInput {
  id: string;
  provider: string;
  displayName: string;
  connectionType: ConnectionType;
  status: ConnectionStatus;
  consentExpiresAt?: string | null;
}

export interface UpsertProviderAccountInput {
  id: string;
  connectionId: string;
  provider: string;
  providerAccountId: string;
  displayName: string;
  accountType: string;
  currency: string;
  metadata?: unknown;
}

/**
 * Manages bank connections, their encrypted OAuth tokens, and the provider
 * accounts discovered for each connection.
 */
export class ConnectionsRepo {
  constructor(
    private readonly db: Db,
    private readonly encryptor: Encryptor | null,
  ) {}

  create(input: CreateConnectionInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO bank_connections
           (id, provider, display_name, connection_type, status, consent_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.provider,
        input.displayName,
        input.connectionType,
        input.status,
        input.consentExpiresAt ?? null,
        now,
        now,
      );
  }

  list(): BankConnectionRow[] {
    return this.db
      .prepare("SELECT * FROM bank_connections ORDER BY created_at ASC")
      .all() as BankConnectionRow[];
  }

  get(id: string): BankConnectionRow | undefined {
    return this.db
      .prepare("SELECT * FROM bank_connections WHERE id = ?")
      .get(id) as BankConnectionRow | undefined;
  }

  setStatus(id: string, status: ConnectionStatus): void {
    this.db
      .prepare(
        "UPDATE bank_connections SET status = ?, updated_at = ? WHERE id = ?",
      )
      .run(status, new Date().toISOString(), id);
  }

  setConsentExpiry(id: string, consentExpiresAt: string): void {
    this.db
      .prepare(
        "UPDATE bank_connections SET consent_expires_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(consentExpiresAt, new Date().toISOString(), id);
  }

  saveTokens(connectionId: string, tokens: TokenSetRecord): void {
    if (!this.encryptor) {
      throw new Error(
        "Cannot persist provider tokens without an encryption key configured.",
      );
    }
    this.db
      .prepare(
        `INSERT INTO provider_tokens
           (connection_id, access_token_encrypted, refresh_token_encrypted, expires_at, scope, token_type, updated_at)
         VALUES (@connection_id, @access, @refresh, @expires_at, @scope, @token_type, @now)
         ON CONFLICT(connection_id) DO UPDATE SET
           access_token_encrypted = excluded.access_token_encrypted,
           refresh_token_encrypted = excluded.refresh_token_encrypted,
           expires_at = excluded.expires_at,
           scope = excluded.scope,
           token_type = excluded.token_type,
           updated_at = excluded.updated_at`,
      )
      .run({
        connection_id: connectionId,
        access: this.encryptor.encrypt(tokens.accessToken),
        refresh: this.encryptor.encrypt(tokens.refreshToken),
        expires_at: tokens.expiresAt ?? null,
        scope: tokens.scope ?? null,
        token_type: tokens.tokenType ?? null,
        now: new Date().toISOString(),
      });
  }

  getTokens(connectionId: string): TokenSetRecord | undefined {
    if (!this.encryptor) return undefined;
    const row = this.db
      .prepare("SELECT * FROM provider_tokens WHERE connection_id = ?")
      .get(connectionId) as
      | {
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          expires_at: string | null;
          scope: string | null;
          token_type: string | null;
        }
      | undefined;
    if (!row) return undefined;
    return {
      accessToken: this.encryptor.decrypt(row.access_token_encrypted),
      refreshToken: this.encryptor.decrypt(row.refresh_token_encrypted),
      expiresAt: row.expires_at ?? undefined,
      scope: row.scope ?? undefined,
      tokenType: row.token_type ?? undefined,
    };
  }

  upsertProviderAccount(input: UpsertProviderAccountInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO provider_accounts
           (id, connection_id, provider, provider_account_id, display_name, account_type, currency, metadata_json, created_at, updated_at)
         VALUES (@id, @connection_id, @provider, @provider_account_id, @display_name, @account_type, @currency, @metadata_json, @now, @now)
         ON CONFLICT(provider, provider_account_id) DO UPDATE SET
           display_name = excluded.display_name,
           account_type = excluded.account_type,
           currency = excluded.currency,
           metadata_json = excluded.metadata_json,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: input.id,
        connection_id: input.connectionId,
        provider: input.provider,
        provider_account_id: input.providerAccountId,
        display_name: input.displayName,
        account_type: input.accountType,
        currency: input.currency,
        metadata_json:
          input.metadata === undefined ? null : JSON.stringify(input.metadata),
        now,
      });
  }

  listProviderAccounts(connectionId?: string): ProviderAccountRow[] {
    if (connectionId) {
      return this.db
        .prepare(
          "SELECT * FROM provider_accounts WHERE connection_id = ? ORDER BY display_name",
        )
        .all(connectionId) as ProviderAccountRow[];
    }
    return this.db
      .prepare("SELECT * FROM provider_accounts ORDER BY display_name")
      .all() as ProviderAccountRow[];
  }
}
