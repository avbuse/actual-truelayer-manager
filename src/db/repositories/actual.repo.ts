import type { Db } from "../index.js";
import type { ActualConfigRow } from "../types.js";

export interface ActualConfigInput {
  serverUrl: string;
  syncId: string;
  passwordEncrypted?: string | null;
  encryptionPasswordEncrypted?: string | null;
}

export class ActualRepo {
  constructor(private readonly db: Db) {}

  get(): ActualConfigRow | undefined {
    return this.db
      .prepare("SELECT * FROM actual_config WHERE id = 1")
      .get() as ActualConfigRow | undefined;
  }

  upsert(input: ActualConfigInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO actual_config
           (id, server_url, sync_id, password_encrypted, encryption_password_encrypted, created_at, updated_at)
         VALUES (1, @server_url, @sync_id, @password_encrypted, @encryption_password_encrypted, @now, @now)
         ON CONFLICT(id) DO UPDATE SET
           server_url = excluded.server_url,
           sync_id = excluded.sync_id,
           password_encrypted = excluded.password_encrypted,
           encryption_password_encrypted = excluded.encryption_password_encrypted,
           updated_at = excluded.updated_at`,
      )
      .run({
        server_url: input.serverUrl,
        sync_id: input.syncId,
        password_encrypted: input.passwordEncrypted ?? null,
        encryption_password_encrypted: input.encryptionPasswordEncrypted ?? null,
        now,
      });
  }
}
