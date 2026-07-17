import type {
  BankAccount,
  BankTransaction,
  BankingProvider,
  CreateAuthUrlInput,
  ExchangeAuthCodeInput,
  ListAccountsInput,
  ListTransactionsInput,
  RefreshTokenInput,
  TokenSet,
} from "../bankingProvider.js";

export interface TrueLayerConfig {
  clientId: string;
  clientSecret: string;
  authBaseUrl?: string;
  apiBaseUrl?: string;
  useSandbox?: boolean;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

/**
 * Live TrueLayer provider (spec §15). Uses the global fetch API (Node 20+),
 * so it adds no HTTP dependency. Network calls are only made when live
 * credentials are configured; the demo provider is used otherwise.
 */
export class TrueLayerProvider implements BankingProvider {
  readonly name = "truelayer";
  private readonly authBase: string;
  private readonly apiBase: string;

  constructor(private readonly config: TrueLayerConfig) {
    this.authBase = config.authBaseUrl ?? "https://auth.truelayer.com";
    this.apiBase = config.apiBaseUrl ?? "https://api.truelayer.com";
  }

  async createAuthUrl(input: CreateAuthUrlInput): Promise<string> {
    const providers = this.config.useSandbox ? "uk-cs-mock" : "uk-ob-all uk-oauth-all";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      scope: "info accounts balance cards transactions offline_access",
      redirect_uri: input.redirectUri,
      state: input.state,
      providers,
    });
    return `${this.authBase}/?${params.toString()}`;
  }

  async exchangeAuthCode(input: ExchangeAuthCodeInput): Promise<TokenSet> {
    return this.requestToken({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
    });
  }

  async refreshToken(input: RefreshTokenInput): Promise<TokenSet> {
    return this.requestToken({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: input.refreshToken,
    });
  }

  async listAccounts(input: ListAccountsInput): Promise<BankAccount[]> {
    const [accounts, cards] = await Promise.all([
      this.getData("/data/v1/accounts", input.tokens.accessToken),
      this.getData("/data/v1/cards", input.tokens.accessToken),
    ]);

    const mapped: BankAccount[] = [];
    for (const a of accounts) {
      const acc = a as Record<string, unknown>;
      mapped.push({
        providerAccountId: String(acc.account_id),
        displayName: String(acc.display_name ?? "Account"),
        accountType:
          String(acc.account_type ?? "").toUpperCase() === "SAVINGS"
            ? "savings"
            : "transaction",
        currency: String(acc.currency ?? "GBP"),
      });
    }
    for (const c of cards) {
      const card = c as Record<string, unknown>;
      mapped.push({
        providerAccountId: String(card.account_id),
        displayName: String(card.display_name ?? "Credit Card"),
        accountType: "credit_card",
        currency: String(card.currency ?? "GBP"),
      });
    }
    return mapped;
  }

  async listTransactions(
    input: ListTransactionsInput,
  ): Promise<BankTransaction[]> {
    const params = new URLSearchParams({ from: input.from, to: input.to });
    // Cards and accounts share the same transactions path shape in the Data API.
    const path = `/data/v1/accounts/${input.providerAccountId}/transactions?${params.toString()}`;
    const results = await this.getData(path, input.tokens.accessToken);

    return results.map((t) => {
      const tx = t as Record<string, unknown>;
      const amount = Number(tx.amount ?? 0);
      return {
        providerTransactionId: String(tx.transaction_id),
        providerAccountId: input.providerAccountId,
        bookedDate: String(tx.timestamp ?? "").slice(0, 10),
        description: String(tx.description ?? ""),
        amountMinor: Math.round(amount * 100),
        currency: String(tx.currency ?? "GBP"),
        merchantName:
          typeof tx.merchant_name === "string" ? tx.merchant_name : undefined,
        raw: tx,
      };
    });
  }

  private async requestToken(
    body: Record<string, string>,
  ): Promise<TokenSet> {
    const response = await fetch(`${this.authBase}/connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    if (!response.ok) {
      throw new Error(
        `TrueLayer token request failed with status ${response.status}`,
      );
    }
    const data = (await response.json()) as TokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
      scope: data.scope,
      tokenType: data.token_type,
    };
  }

  private async getData(
    path: string,
    accessToken: string,
  ): Promise<unknown[]> {
    const response = await fetch(`${this.apiBase}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(
        `TrueLayer data request to ${path} failed with status ${response.status}`,
      );
    }
    const payload = (await response.json()) as { results?: unknown[] };
    return payload.results ?? [];
  }
}
