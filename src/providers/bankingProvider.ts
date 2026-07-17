export type BankAccountType =
  | "transaction"
  | "savings"
  | "credit_card"
  | "unknown";

export interface BankAccount {
  providerAccountId: string;
  displayName: string;
  accountType: BankAccountType;
  currency: string;
  iban?: string;
  sortCode?: string;
  accountNumberLast4?: string;
  balanceMinor?: number;
}

export interface BankTransaction {
  providerTransactionId: string;
  providerAccountId: string;
  bookedDate: string;
  description: string;
  amountMinor: number;
  currency: string;
  merchantName?: string;
  raw?: unknown;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
}

export interface CreateAuthUrlInput {
  state: string;
  redirectUri: string;
  connectionType: "bank_account" | "credit_card";
}

export interface ExchangeAuthCodeInput {
  code: string;
  redirectUri: string;
}

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface ListAccountsInput {
  tokens: TokenSet;
}

export interface ListTransactionsInput {
  tokens: TokenSet;
  providerAccountId: string;
  from: string;
  to: string;
}

/**
 * Provider-agnostic banking interface (spec §7). TrueLayer is the first
 * implementation, but the sync engine and Actual import logic never depend on
 * TrueLayer-specific details.
 */
export interface BankingProvider {
  readonly name: string;
  createAuthUrl(input: CreateAuthUrlInput): Promise<string>;
  exchangeAuthCode(input: ExchangeAuthCodeInput): Promise<TokenSet>;
  refreshToken(input: RefreshTokenInput): Promise<TokenSet>;
  listAccounts(input: ListAccountsInput): Promise<BankAccount[]>;
  listTransactions(input: ListTransactionsInput): Promise<BankTransaction[]>;
  /**
   * Optional: returns an ISO timestamp for when the current consent expires, or
   * `undefined` when the provider cannot determine it (spec §15.4).
   */
  getConsentExpiry?(input: ListAccountsInput): Promise<string | undefined>;
}
