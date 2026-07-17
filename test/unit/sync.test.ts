import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";
import { createEncryptor } from "../../src/crypto/encrypt.js";
import { openDatabase } from "../../src/db/index.js";
import { ConnectionsRepo } from "../../src/db/repositories/connections.repo.js";
import { MappingsRepo } from "../../src/db/repositories/mappings.repo.js";
import { SyncRunsRepo } from "../../src/db/repositories/syncRuns.repo.js";
import { DemoActualClient } from "../../src/actual/demoActualClient.js";
import { DemoProvider } from "../../src/providers/demo/demoProvider.js";
import { SyncRunner } from "../../src/sync/syncRunner.js";
import { transactionKey } from "../../src/sync/normalise.js";
import type { BankTransaction } from "../../src/providers/bankingProvider.js";

function setup() {
  const db = openDatabase(":memory:");
  const enc = createEncryptor(randomBytes(32).toString("base64"));
  const connections = new ConnectionsRepo(db, enc);
  const mappings = new MappingsRepo(db);
  const syncRuns = new SyncRunsRepo(db);
  const config = loadConfig({ DEMO_MODE: "1", APP_DB_PATH: ":memory:" });

  connections.create({
    id: "c1",
    provider: "demo",
    displayName: "Demo",
    connectionType: "bank_account",
    status: "active",
  });
  connections.saveTokens("c1", { accessToken: "a", refreshToken: "r" });
  mappings.upsert({
    id: "m1",
    connectionId: "c1",
    providerAccountId: "demo-current",
    actualAccountId: "actual-current",
    actualAccountName: "Current",
  });

  const runner = new SyncRunner({
    config,
    provider: new DemoProvider(),
    actual: new DemoActualClient(),
    connections,
    mappings,
    syncRuns,
  });
  return { db, runner };
}

describe("transactionKey", () => {
  it("uses provider id when present", () => {
    const tx = { providerTransactionId: "abc" } as BankTransaction;
    expect(transactionKey("demo", tx)).toEqual({ id: "abc", fallback: false });
  });

  it("derives a deterministic fallback id when missing", () => {
    const tx = {
      providerTransactionId: "",
      providerAccountId: "acc",
      bookedDate: "2026-01-01",
      description: "Coffee",
      amountMinor: -350,
      currency: "GBP",
    } as BankTransaction;
    const a = transactionKey("demo", tx);
    const b = transactionKey("demo", tx);
    expect(a.fallback).toBe(true);
    expect(a.id).toBe(b.id);
  });
});

describe("SyncRunner", () => {
  it("dry-run imports nothing but reports fetched", async () => {
    const { db, runner } = setup();
    const summary = await runner.run({ dryRun: true, mode: "dry_run" });
    expect(summary.fetched).toBeGreaterThan(0);
    expect(summary.imported).toBe(0);
    db.close();
  });

  it("live sync imports, then a second run finds only duplicates", async () => {
    const { db, runner } = setup();
    const first = await runner.run({ dryRun: false, mode: "manual" });
    expect(first.imported).toBeGreaterThan(0);
    expect(first.status).toBe("success");

    // The second run only refetches the overlap window; everything it sees was
    // already imported, so nothing new is imported and all are duplicates.
    const second = await runner.run({ dryRun: false, mode: "manual" });
    expect(second.imported).toBe(0);
    expect(second.duplicate).toBeGreaterThan(0);
    expect(second.duplicate).toBe(second.fetched);
    db.close();
  });
});
