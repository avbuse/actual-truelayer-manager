export interface ActualAccount {
  id: string;
  name: string;
}

export interface ActualImportTransaction {
  accountId: string;
  date: string;
  amountMinor: number;
  payeeName?: string;
  importedId: string;
  notes?: string;
}

export interface ActualConnectionInfo {
  serverUrl: string;
  password: string;
  syncId: string;
  encryptionPassword?: string;
}

export interface ImportResult {
  added: number;
  updated: number;
}

/**
 * Abstraction over Actual Budget (spec §14). The real implementation wraps
 * `@actual-app/api`; the demo implementation keeps an in-memory budget so the
 * flow works without a running Actual server.
 */
export interface ActualClient {
  testConnection(): Promise<{ ok: boolean; message: string }>;
  listAccounts(): Promise<ActualAccount[]>;
  importTransactions(
    accountId: string,
    transactions: ActualImportTransaction[],
  ): Promise<ImportResult>;
  /**
   * Optional: current balance of an Actual account in minor units, used for
   * balance-drift warnings (spec §13.5). Returns `undefined` when unavailable.
   */
  getAccountBalance?(accountId: string): Promise<number | undefined>;
  shutdown(): Promise<void>;
}
