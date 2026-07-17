import { randomUUID } from "node:crypto";
import type { ActualClient } from "../actual/actualClient.js";
import type { AppConfig } from "../config/env.js";
import type { ConnectionsRepo } from "../db/repositories/connections.repo.js";
import type { MappingsRepo } from "../db/repositories/mappings.repo.js";
import type { SyncRunsRepo } from "../db/repositories/syncRuns.repo.js";
import type { BankingProvider } from "../providers/bankingProvider.js";
import { normaliseTransaction } from "./normalise.js";

export interface SyncOptions {
  dryRun: boolean;
  mode: "manual" | "scheduled" | "live" | "dry_run";
}

export interface SyncSummary {
  runId: string;
  fetched: number;
  imported: number;
  duplicate: number;
  skipped: number;
  failed: number;
  status: "success" | "partial" | "failed";
}

export interface SyncRunnerDeps {
  config: AppConfig;
  provider: BankingProvider;
  actual: ActualClient;
  connections: ConnectionsRepo;
  mappings: MappingsRepo;
  syncRuns: SyncRunsRepo;
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
}

/**
 * Executes a sync across all enabled account mappings (spec §13). Supports both
 * dry-run (fetch/normalise/dedupe, import nothing) and live import, records a
 * `sync_runs` row plus per-transaction `sync_run_items`, and de-duplicates via
 * the `imported_transactions` table.
 */
export class SyncRunner {
  constructor(private readonly deps: SyncRunnerDeps) {}

  async run(options: SyncOptions): Promise<SyncSummary> {
    const runId = randomUUID();
    const provider = this.deps.provider;
    const counts = { fetched: 0, imported: 0, duplicate: 0, skipped: 0, failed: 0 };

    this.deps.syncRuns.start(runId, options.mode);

    const to = new Date();
    const enabledMappings = this.deps.mappings.listEnabled();

    try {
      for (const mapping of enabledMappings) {
        const connection = this.deps.connections.get(mapping.connection_id);
        if (!connection || connection.status === "disabled") {
          counts.skipped += 1;
          continue;
        }

        const tokens = this.deps.connections.getTokens(mapping.connection_id);
        if (!tokens) {
          counts.skipped += 1;
          this.record(runId, mapping, undefined, "skipped", "no tokens");
          continue;
        }

        const from = this.computeFrom(mapping.last_successful_sync_at, to);

        let transactions;
        try {
          transactions = await provider.listTransactions({
            tokens,
            providerAccountId: mapping.provider_account_id,
            from: from.toISOString().slice(0, 10),
            to: to.toISOString().slice(0, 10),
          });
        } catch (error) {
          counts.failed += 1;
          this.record(
            runId,
            mapping,
            undefined,
            "failed",
            error instanceof Error ? error.message : "fetch failed",
          );
          continue;
        }

        const toImport = [];
        for (const tx of transactions) {
          counts.fetched += 1;
          const normalised = normaliseTransaction(
            provider.name,
            tx,
            mapping.actual_account_id,
          );

          if (
            this.deps.syncRuns.isImported(
              provider.name,
              mapping.provider_account_id,
              normalised.importedId,
            )
          ) {
            counts.duplicate += 1;
            this.record(runId, mapping, tx.amountMinor, "duplicate", undefined, tx.bookedDate, normalised.importedId);
            continue;
          }

          if (options.dryRun) {
            counts.imported += 0;
            this.record(runId, mapping, tx.amountMinor, "would_import", undefined, tx.bookedDate, normalised.importedId);
            toImport.push({ normalised, tx });
            continue;
          }

          toImport.push({ normalised, tx });
        }

        if (!options.dryRun && toImport.length > 0) {
          await this.deps.actual.importTransactions(
            mapping.actual_account_id,
            toImport.map((t) => t.normalised),
          );
          for (const { normalised, tx } of toImport) {
            this.deps.syncRuns.recordImported({
              id: randomUUID(),
              provider: provider.name,
              providerAccountId: mapping.provider_account_id,
              providerTransactionId: normalised.importedId,
              actualAccountId: mapping.actual_account_id,
              bookedDate: tx.bookedDate,
              amountMinor: tx.amountMinor,
              currency: tx.currency,
              syncRunId: runId,
            });
            counts.imported += 1;
            this.record(runId, mapping, tx.amountMinor, "imported", undefined, tx.bookedDate, normalised.importedId);
          }
          this.deps.mappings.markSynced(mapping.id, to.toISOString());
        } else if (!options.dryRun) {
          this.deps.mappings.markSynced(mapping.id, to.toISOString());
        }
      }

      const status: SyncSummary["status"] =
        counts.failed > 0
          ? counts.imported > 0 || counts.duplicate > 0
            ? "partial"
            : "failed"
          : "success";

      this.deps.syncRuns.finish(runId, status, counts);
      return { runId, ...counts, status };
    } catch (error) {
      this.deps.syncRuns.finish(runId, "failed", counts, error instanceof Error ? error.message : "sync failed");
      return { runId, ...counts, status: "failed" };
    }
  }

  private computeFrom(lastSyncedAt: string | null, to: Date): Date {
    if (!lastSyncedAt) {
      return new Date(to.getTime() - this.deps.config.syncDaysLookback * 86_400_000);
    }
    return new Date(
      new Date(lastSyncedAt).getTime() -
        this.deps.config.syncOverlapDays * 86_400_000,
    );
  }

  private record(
    runId: string,
    mapping: {
      connection_id: string;
      provider_account_id: string;
      actual_account_id: string;
    },
    amountMinor: number | undefined,
    status: "fetched" | "would_import" | "imported" | "duplicate" | "skipped" | "failed",
    message?: string,
    bookedDate?: string,
    providerTransactionId?: string,
  ): void {
    this.deps.syncRuns.addItem({
      id: randomUUID(),
      syncRunId: runId,
      connectionId: mapping.connection_id,
      providerAccountId: mapping.provider_account_id,
      actualAccountId: mapping.actual_account_id,
      providerTransactionId,
      bookedDate,
      amountMinor,
      currency: "GBP",
      status,
      message,
    });
  }
}
