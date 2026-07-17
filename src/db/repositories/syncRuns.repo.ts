import type { Db } from "../index.js";
import type {
  SyncItemStatus,
  SyncMode,
  SyncRunRow,
  SyncStatus,
} from "../types.js";

export interface SyncRunCounts {
  fetched: number;
  imported: number;
  duplicate: number;
  skipped: number;
  failed: number;
}

export interface SyncRunItemInput {
  id: string;
  syncRunId: string;
  connectionId: string;
  providerAccountId: string;
  actualAccountId: string;
  providerTransactionId?: string;
  bookedDate?: string;
  amountMinor?: number;
  currency?: string;
  status: SyncItemStatus;
  message?: string;
}

export interface ImportedTransactionInput {
  id: string;
  provider: string;
  providerAccountId: string;
  providerTransactionId: string;
  actualAccountId: string;
  bookedDate: string;
  amountMinor: number;
  currency: string;
  syncRunId: string;
}

export class SyncRunsRepo {
  constructor(private readonly db: Db) {}

  start(id: string, mode: SyncMode): void {
    this.db
      .prepare(
        `INSERT INTO sync_runs (id, mode, status, started_at) VALUES (?, ?, 'running', ?)`,
      )
      .run(id, mode, new Date().toISOString());
  }

  finish(id: string, status: SyncStatus, counts: SyncRunCounts, error?: string): void {
    this.db
      .prepare(
        `UPDATE sync_runs SET
           status = @status, finished_at = @finished_at,
           fetched_count = @fetched, imported_count = @imported,
           duplicate_count = @duplicate, skipped_count = @skipped,
           failed_count = @failed, error_message = @error
         WHERE id = @id`,
      )
      .run({
        id,
        status,
        finished_at: new Date().toISOString(),
        fetched: counts.fetched,
        imported: counts.imported,
        duplicate: counts.duplicate,
        skipped: counts.skipped,
        failed: counts.failed,
        error: error ?? null,
      });
  }

  addItem(input: SyncRunItemInput): void {
    this.db
      .prepare(
        `INSERT INTO sync_run_items
           (id, sync_run_id, connection_id, provider_account_id, actual_account_id,
            provider_transaction_id, booked_date, amount_minor, currency, status, message, created_at)
         VALUES (@id, @sync_run_id, @connection_id, @provider_account_id, @actual_account_id,
            @provider_transaction_id, @booked_date, @amount_minor, @currency, @status, @message, @created_at)`,
      )
      .run({
        id: input.id,
        sync_run_id: input.syncRunId,
        connection_id: input.connectionId,
        provider_account_id: input.providerAccountId,
        actual_account_id: input.actualAccountId,
        provider_transaction_id: input.providerTransactionId ?? null,
        booked_date: input.bookedDate ?? null,
        amount_minor: input.amountMinor ?? null,
        currency: input.currency ?? null,
        status: input.status,
        message: input.message ?? null,
        created_at: new Date().toISOString(),
      });
  }

  get(id: string): SyncRunRow | undefined {
    return this.db
      .prepare("SELECT * FROM sync_runs WHERE id = ?")
      .get(id) as SyncRunRow | undefined;
  }

  latest(): SyncRunRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM sync_runs WHERE mode != 'dry_run' ORDER BY started_at DESC LIMIT 1",
      )
      .get() as SyncRunRow | undefined;
  }

  recent(limit = 20): SyncRunRow[] {
    return this.db
      .prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as SyncRunRow[];
  }

  isImported(
    provider: string,
    providerAccountId: string,
    providerTransactionId: string,
  ): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM imported_transactions
         WHERE provider = ? AND provider_account_id = ? AND provider_transaction_id = ?`,
      )
      .get(provider, providerAccountId, providerTransactionId);
    return row !== undefined;
  }

  recordImported(input: ImportedTransactionInput): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO imported_transactions
           (id, provider, provider_account_id, provider_transaction_id, actual_account_id,
            booked_date, amount_minor, currency, imported_at, sync_run_id)
         VALUES (@id, @provider, @provider_account_id, @provider_transaction_id, @actual_account_id,
            @booked_date, @amount_minor, @currency, @imported_at, @sync_run_id)`,
      )
      .run({
        id: input.id,
        provider: input.provider,
        provider_account_id: input.providerAccountId,
        provider_transaction_id: input.providerTransactionId,
        actual_account_id: input.actualAccountId,
        booked_date: input.bookedDate,
        amount_minor: input.amountMinor,
        currency: input.currency,
        imported_at: new Date().toISOString(),
        sync_run_id: input.syncRunId,
      });
  }
}
