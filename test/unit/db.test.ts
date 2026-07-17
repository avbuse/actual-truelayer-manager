import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openDatabase, runMigrations } from "../../src/db/index.js";
import { ConnectionsRepo } from "../../src/db/repositories/connections.repo.js";
import { MappingsRepo } from "../../src/db/repositories/mappings.repo.js";
import { SettingsRepo } from "../../src/db/repositories/settings.repo.js";
import { SyncRunsRepo } from "../../src/db/repositories/syncRuns.repo.js";
import { createEncryptor } from "../../src/crypto/encrypt.js";

const enc = createEncryptor(randomBytes(32).toString("base64"));

describe("migrations", () => {
  it("creates all tables and is idempotent", () => {
    const db = openDatabase(":memory:");
    // Running again must not throw or duplicate.
    runMigrations(db);
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);

    for (const t of [
      "schema_migrations",
      "settings",
      "actual_config",
      "bank_connections",
      "provider_tokens",
      "provider_accounts",
      "account_mappings",
      "sync_runs",
      "sync_run_items",
      "imported_transactions",
    ]) {
      expect(tables).toContain(t);
    }
    db.close();
  });
});

describe("repositories", () => {
  it("stores tokens encrypted and round-trips them", () => {
    const db = openDatabase(":memory:");
    const repo = new ConnectionsRepo(db, enc);
    repo.create({
      id: "c1",
      provider: "demo",
      displayName: "Demo",
      connectionType: "bank_account",
      status: "setup_pending",
    });
    repo.saveTokens("c1", { accessToken: "acc", refreshToken: "ref" });

    const rawRow = db
      .prepare("SELECT access_token_encrypted FROM provider_tokens WHERE connection_id = 'c1'")
      .get() as { access_token_encrypted: string };
    expect(rawRow.access_token_encrypted).not.toContain("acc");

    const tokens = repo.getTokens("c1");
    expect(tokens?.accessToken).toBe("acc");
    expect(tokens?.refreshToken).toBe("ref");
    db.close();
  });

  it("deduplicates imported transactions", () => {
    const db = openDatabase(":memory:");
    const runs = new SyncRunsRepo(db);
    runs.start("r1", "live");
    expect(runs.isImported("demo", "acc1", "tx1")).toBe(false);
    runs.recordImported({
      id: "i1",
      provider: "demo",
      providerAccountId: "acc1",
      providerTransactionId: "tx1",
      actualAccountId: "a1",
      bookedDate: "2026-01-01",
      amountMinor: -100,
      currency: "GBP",
      syncRunId: "r1",
    });
    expect(runs.isImported("demo", "acc1", "tx1")).toBe(true);
    db.close();
  });

  it("persists settings and mappings", () => {
    const db = openDatabase(":memory:");
    const settings = new SettingsRepo(db);
    settings.set("k", "v");
    expect(settings.get("k")).toBe("v");

    // account_mappings has a FK to bank_connections, so create one first.
    const connections = new ConnectionsRepo(db, enc);
    connections.create({
      id: "c1",
      provider: "demo",
      displayName: "Demo",
      connectionType: "bank_account",
      status: "active",
    });

    const mappings = new MappingsRepo(db);
    mappings.upsert({
      id: "m1",
      connectionId: "c1",
      providerAccountId: "pa1",
      actualAccountId: "aa1",
      actualAccountName: "Current",
    });
    expect(mappings.listEnabled()).toHaveLength(1);
    db.close();
  });
});
