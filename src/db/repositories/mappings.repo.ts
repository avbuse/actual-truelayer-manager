import type { Db } from "../index.js";
import type { AccountMappingRow } from "../types.js";

export interface UpsertMappingInput {
  id: string;
  connectionId: string;
  providerAccountId: string;
  actualAccountId: string;
  actualAccountName: string;
  enabled?: boolean;
}

export class MappingsRepo {
  constructor(private readonly db: Db) {}

  upsert(input: UpsertMappingInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO account_mappings
           (id, connection_id, provider_account_id, actual_account_id, actual_account_name, enabled, created_at, updated_at)
         VALUES (@id, @connection_id, @provider_account_id, @actual_account_id, @actual_account_name, @enabled, @now, @now)
         ON CONFLICT(connection_id, provider_account_id) DO UPDATE SET
           actual_account_id = excluded.actual_account_id,
           actual_account_name = excluded.actual_account_name,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: input.id,
        connection_id: input.connectionId,
        provider_account_id: input.providerAccountId,
        actual_account_id: input.actualAccountId,
        actual_account_name: input.actualAccountName,
        enabled: input.enabled === false ? 0 : 1,
        now,
      });
  }

  list(): AccountMappingRow[] {
    return this.db
      .prepare("SELECT * FROM account_mappings ORDER BY created_at")
      .all() as AccountMappingRow[];
  }

  listEnabled(): AccountMappingRow[] {
    return this.db
      .prepare("SELECT * FROM account_mappings WHERE enabled = 1")
      .all() as AccountMappingRow[];
  }

  markSynced(id: string, at: string): void {
    this.db
      .prepare(
        "UPDATE account_mappings SET last_successful_sync_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(at, new Date().toISOString(), id);
  }
}
