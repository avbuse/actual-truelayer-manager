export type ConnectionType =
  | "bank_account"
  | "credit_card"
  | "mixed"
  | "unknown";

export type ConnectionStatus =
  | "setup_pending"
  | "active"
  | "reauth_required"
  | "disabled"
  | "error";

export type SyncMode = "dry_run" | "live" | "scheduled" | "manual";

export type SyncStatus =
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "cancelled";

export type SyncItemStatus =
  | "fetched"
  | "would_import"
  | "imported"
  | "duplicate"
  | "skipped"
  | "failed";

export interface ActualConfigRow {
  server_url: string;
  sync_id: string;
  password_encrypted: string | null;
  encryption_password_encrypted: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankConnectionRow {
  id: string;
  provider: string;
  display_name: string;
  connection_type: ConnectionType;
  status: ConnectionStatus;
  consent_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderAccountRow {
  id: string;
  connection_id: string;
  provider: string;
  provider_account_id: string;
  display_name: string;
  account_type: string;
  currency: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountMappingRow {
  id: string;
  connection_id: string;
  provider_account_id: string;
  actual_account_id: string;
  actual_account_name: string;
  enabled: number;
  last_successful_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncRunRow {
  id: string;
  mode: SyncMode;
  status: SyncStatus;
  started_at: string;
  finished_at: string | null;
  fetched_count: number;
  imported_count: number;
  duplicate_count: number;
  skipped_count: number;
  failed_count: number;
  error_message: string | null;
}

export interface TokenSetRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
}
