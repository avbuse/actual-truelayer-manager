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

export interface TrueLayerLogger {
  info: (message: string) => void;
  warn?: (message: string) => void;
}

export interface TrueLayerConfig {
  clientId: string;
  clientSecret: string;
  authBaseUrl?: string;
  apiBaseUrl?: string;
  useSandbox?: boolean;
  /** Optional sink for non-sensitive operational messages (e.g. page counts). */
  logger?: TrueLayerLogger;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface DataApiPage {
  results: unknown[];
  /** Opaque cursor for the next request (`?cursor=`), when present. */
  nextCursor?: string;
  /** Absolute or API-relative URL for the next page, when present. */
  nextPath?: string;
}

/**
 * TrueLayer's default Open Banking consent lasts 90 days. TrueLayer does not
 * return an explicit expiry in the token response, so we record this estimate
 * at connection time to drive the dashboard consent-expiry warning (spec §15.4).
 */
const CONSENT_WINDOW_DAYS = 90;

/**
 * Guard against runaway pagination. Data API v1 typically returns a single
 * page today; when pagination metadata appears we follow it up to this limit.
 */
export const MAX_TRANSACTION_PAGES = 100;

/**
 * Live TrueLayer provider (spec §15). Uses the global fetch API (Node 20+),
 * so it adds no HTTP dependency. Network calls are only made when live
 * credentials are configured; the demo provider is used otherwise.
 *
 * Transaction endpoints: official Data API v1 docs show a single
 * `{ results: [...] }` payload with no cursor. We still follow
 * `pagination.next_cursor` / top-level `next_cursor` / `Link: rel="next"`
 * when present so large windows cannot silently truncate if TrueLayer (or a
 * provider adapter) starts paginating.
 */
export class TrueLayerProvider implements BankingProvider {
  readonly name = "truelayer";
  private readonly authBase: string;
  private readonly apiBase: string;
  private readonly logger?: TrueLayerLogger;

  constructor(private readonly config: TrueLayerConfig) {
    const sandbox = config.useSandbox ?? false;
    this.authBase =
      config.authBaseUrl ??
      (sandbox
        ? "https://auth.truelayer-sandbox.com"
        : "https://auth.truelayer.com");
    this.apiBase =
      config.apiBaseUrl ??
      (sandbox
        ? "https://api.truelayer-sandbox.com"
        : "https://api.truelayer.com");
    this.logger = config.logger;
  }

  async createAuthUrl(input: CreateAuthUrlInput): Promise<string> {
    const providers = this.config.useSandbox
      ? "uk-cs-mock"
      : "uk-ob-all uk-oauth-all";
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
    const token = input.tokens.accessToken;
    const [accounts, cards] = await Promise.all([
      this.getData("/data/v1/accounts", token),
      this.getData("/data/v1/cards", token),
    ]);

    const mapped: BankAccount[] = [];
    for (const a of accounts) {
      const acc = a as Record<string, unknown>;
      const id = String(acc.account_id);
      mapped.push({
        providerAccountId: id,
        displayName: String(acc.display_name ?? "Account"),
        accountType:
          String(acc.account_type ?? "").toUpperCase() === "SAVINGS"
            ? "savings"
            : "transaction",
        currency: String(acc.currency ?? "GBP"),
        balanceMinor: await this.getBalanceMinor(
          `/data/v1/accounts/${id}/balance`,
          token,
        ),
      });
    }
    for (const c of cards) {
      const card = c as Record<string, unknown>;
      const id = String(card.account_id);
      mapped.push({
        providerAccountId: id,
        displayName: String(card.display_name ?? "Credit Card"),
        accountType: "credit_card",
        currency: String(card.currency ?? "GBP"),
        balanceMinor: await this.getBalanceMinor(
          `/data/v1/cards/${id}/balance`,
          token,
        ),
      });
    }
    return mapped;
  }

  async listTransactions(
    input: ListTransactionsInput,
  ): Promise<BankTransaction[]> {
    const params = new URLSearchParams({ from: input.from, to: input.to });
    const query = params.toString();
    // Accounts and cards use different transaction paths; try the account path
    // first and fall back to the card path when the id is not a bank account.
    let results = await this.getAllDataPages(
      `/data/v1/accounts/${input.providerAccountId}/transactions?${query}`,
      input.tokens.accessToken,
      "account",
    );
    if (results.length === 0) {
      results = await this.getAllDataPages(
        `/data/v1/cards/${input.providerAccountId}/transactions?${query}`,
        input.tokens.accessToken,
        "card",
      );
    }

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

  async getConsentExpiry(): Promise<string | undefined> {
    return new Date(
      Date.now() + CONSENT_WINDOW_DAYS * 86_400_000,
    ).toISOString();
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

  /** Single-page fetch used for accounts/cards/balances. */
  private async getData(
    path: string,
    accessToken: string,
  ): Promise<unknown[]> {
    const page = await this.fetchDataPage(path, accessToken);
    return page.results;
  }

  /**
   * Follows every result page for a transactions (or similar) endpoint until
   * there is no next cursor/URL, a repeated cursor is detected, or
   * {@link MAX_TRANSACTION_PAGES} is hit.
   */
  private async getAllDataPages(
    initialPath: string,
    accessToken: string,
    kind: "account" | "card",
  ): Promise<unknown[]> {
    const collected: unknown[] = [];
    const seenCursors = new Set<string>();
    let path: string | undefined = initialPath;
    let pages = 0;

    while (path) {
      pages += 1;
      if (pages > MAX_TRANSACTION_PAGES) {
        throw new Error(
          `TrueLayer ${kind} transactions pagination exceeded ${MAX_TRANSACTION_PAGES} pages; aborting to avoid an infinite loop.`,
        );
      }

      const page = await this.fetchDataPage(path, accessToken);
      collected.push(...page.results);

      const nextKey = page.nextCursor ?? page.nextPath;
      if (!nextKey) {
        path = undefined;
        break;
      }
      if (seenCursors.has(nextKey)) {
        throw new Error(
          `TrueLayer ${kind} transactions pagination returned a repeated cursor; aborting to avoid an infinite loop.`,
        );
      }
      seenCursors.add(nextKey);

      path = page.nextPath
        ? page.nextPath
        : this.withCursor(initialPath, page.nextCursor!);
    }

    if (pages > 1) {
      this.logger?.info(
        `TrueLayer ${kind} transactions fetch used ${pages} pages (${collected.length} results, no raw payloads logged).`,
      );
    }

    return collected;
  }

  private async fetchDataPage(
    path: string,
    accessToken: string,
  ): Promise<DataApiPage> {
    const response = await fetch(`${this.apiBase}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 404) return { results: [] };
    if (response.status === 401 || response.status === 403) {
      throw new AuthorizationError(
        `TrueLayer request to ${path} was unauthorized (status ${response.status}).`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `TrueLayer data request to ${path} failed with status ${response.status}`,
      );
    }
    const payload = (await response.json()) as Record<string, unknown>;
    return parseDataApiPage(payload, response.headers.get("link"), this.apiBase);
  }

  /** Best-effort account balance in minor units; undefined when unavailable. */
  private async getBalanceMinor(
    path: string,
    accessToken: string,
  ): Promise<number | undefined> {
    try {
      const results = await this.getData(path, accessToken);
      const first = results[0] as Record<string, unknown> | undefined;
      if (!first) return undefined;
      const value = first.current ?? first.available;
      if (typeof value !== "number") return undefined;
      return Math.round(value * 100);
    } catch {
      return undefined;
    }
  }

  private withCursor(path: string, cursor: string): string {
    const qIndex = path.indexOf("?");
    const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path;
    const query = qIndex >= 0 ? path.slice(qIndex + 1) : "";
    const params = new URLSearchParams(query);
    params.set("cursor", cursor);
    return `${pathname}?${params.toString()}`;
  }
}

/**
 * Raised when the provider returns 401/403, indicating the token/consent is no
 * longer valid and the connection needs re-authentication (spec §15.3).
 */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Exported for unit tests covering pagination metadata parsing. */
export function parseDataApiPage(
  payload: Record<string, unknown>,
  linkHeader: string | null | undefined,
  apiBase: string,
): DataApiPage {
  const results = Array.isArray(payload.results) ? payload.results : [];

  const pagination =
    payload.pagination && typeof payload.pagination === "object"
      ? (payload.pagination as Record<string, unknown>)
      : undefined;
  const nestedCursor =
    typeof pagination?.next_cursor === "string" && pagination.next_cursor
      ? pagination.next_cursor
      : undefined;
  const topCursor =
    typeof payload.next_cursor === "string" && payload.next_cursor
      ? payload.next_cursor
      : undefined;
  const nextCursor = nestedCursor ?? topCursor;

  const nextUrl =
    (typeof payload.next === "string" && payload.next
      ? payload.next
      : undefined) ?? parseLinkNext(linkHeader);

  return {
    results,
    nextCursor,
    nextPath: nextUrl ? toApiPath(nextUrl, apiBase) : undefined,
  };
}

function parseLinkNext(linkHeader: string | null | undefined): string | undefined {
  if (!linkHeader) return undefined;
  // e.g. <https://api.truelayer.com/data/v1/...?cursor=abc>; rel="next"
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function toApiPath(urlOrPath: string, apiBase: string): string {
  if (urlOrPath.startsWith("/")) return urlOrPath;
  try {
    const parsed = new URL(urlOrPath);
    const base = new URL(apiBase);
    if (parsed.origin === base.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Fall through and treat as opaque path.
  }
  return urlOrPath.startsWith("http")
    ? urlOrPath.replace(apiBase.replace(/\/$/, ""), "")
    : urlOrPath;
}
