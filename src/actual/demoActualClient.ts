import type {
  ActualAccount,
  ActualClient,
  ActualImportTransaction,
  ImportResult,
} from "./actualClient.js";

/**
 * In-memory Actual Budget stand-in used in demo mode. Provides a fixed set of
 * accounts and de-duplicates imports by `importedId`, mirroring Actual's own
 * reconciliation behaviour.
 */
export class DemoActualClient implements ActualClient {
  private readonly seen = new Set<string>();
  private readonly accounts: ActualAccount[] = [
    { id: "actual-current", name: "Everyday Current" },
    { id: "actual-savings", name: "Rainy Day Savings" },
    { id: "actual-credit", name: "Credit Card" },
  ];

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Connected to demo Actual budget." };
  }

  async listAccounts(): Promise<ActualAccount[]> {
    return this.accounts;
  }

  async importTransactions(
    _accountId: string,
    transactions: ActualImportTransaction[],
  ): Promise<ImportResult> {
    let added = 0;
    for (const tx of transactions) {
      if (this.seen.has(tx.importedId)) continue;
      this.seen.add(tx.importedId);
      added += 1;
    }
    return { added, updated: 0 };
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}
