import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ActualAccount,
  ActualClient,
  ActualConnectionInfo,
  ActualImportTransaction,
  ImportResult,
} from "./actualClient.js";

/** Minimal surface of `@actual-app/api` that this client depends on. */
interface ActualApi {
  init(options: {
    dataDir: string;
    serverURL: string;
    password: string;
  }): Promise<void>;
  downloadBudget(
    syncId: string,
    options?: { password?: string },
  ): Promise<void>;
  getAccounts(): Promise<{ id: string; name: string }[]>;
  importTransactions(
    accountId: string,
    transactions: Record<string, unknown>[],
  ): Promise<{ added?: unknown[]; updated?: unknown[] }>;
  shutdown(): Promise<void>;
}

/**
 * Live Actual Budget client backed by `@actual-app/api` (spec §14).
 *
 * The package is loaded lazily via a dynamic specifier so the app (and demo
 * mode) still run when it is not installed. Install it and configure
 * `ACTUAL_SERVER_URL` to enable live sync.
 */
export class RealActualClient implements ActualClient {
  private api: ActualApi | null = null;

  constructor(
    private readonly info: ActualConnectionInfo,
    private readonly dataDir: string,
  ) {}

  private async init(): Promise<ActualApi> {
    if (this.api) return this.api;

    const specifier = "@actual-app/api";
    let api: ActualApi;
    try {
      api = (await import(specifier)) as unknown as ActualApi;
    } catch (cause) {
      throw new Error(
        "Live Actual mode requires the '@actual-app/api' package. Install it (npm i @actual-app/api) to enable live sync.",
        { cause },
      );
    }

    const budgetDir = join(this.dataDir, "actual");
    mkdirSync(budgetDir, { recursive: true });
    await api.init({
      dataDir: budgetDir,
      serverURL: this.info.serverUrl,
      password: this.info.password,
    });
    await api.downloadBudget(this.info.syncId, {
      password: this.info.encryptionPassword,
    });

    this.api = api;
    return api;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const api = await this.init();
      await api.getAccounts();
      return { ok: true, message: "Connected to Actual server." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Connection failed.",
      };
    }
  }

  async listAccounts(): Promise<ActualAccount[]> {
    const api = await this.init();
    const accounts = await api.getAccounts();
    return accounts.map((a) => ({ id: a.id, name: a.name }));
  }

  async importTransactions(
    accountId: string,
    transactions: ActualImportTransaction[],
  ): Promise<ImportResult> {
    const api = await this.init();
    const result = await api.importTransactions(
      accountId,
      transactions.map((t) => ({
        date: t.date,
        amount: t.amountMinor,
        payee_name: t.payeeName,
        imported_id: t.importedId,
        notes: t.notes,
      })),
    );
    return {
      added: result.added?.length ?? 0,
      updated: result.updated?.length ?? 0,
    };
  }

  async shutdown(): Promise<void> {
    if (this.api) {
      await this.api.shutdown();
    }
  }
}
