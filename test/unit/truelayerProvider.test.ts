import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthorizationError,
  MAX_TRANSACTION_PAGES,
  TrueLayerProvider,
  parseDataApiPage,
} from "../../src/providers/truelayer/truelayerProvider.js";

interface Recorded {
  path: string;
  search: string;
  body: string;
  auth?: string;
}

type TxHandler = (url: URL) => { code: number; payload: unknown } | undefined;

/**
 * A tiny mock of the TrueLayer auth + data APIs so the live provider's real
 * network code path (fetch, headers, parsing) is exercised end to end.
 */
function startMockTrueLayer(options?: {
  transactionHandler?: TxHandler;
}): Promise<{
  server: Server;
  baseUrl: string;
  requests: Recorded[];
}> {
  const requests: Recorded[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      requests.push({
        path: url.pathname,
        search: url.search,
        body,
        auth: req.headers.authorization,
      });

      const send = (
        code: number,
        payload: unknown,
        headers?: Record<string, string>,
      ): void => {
        res.writeHead(code, {
          "content-type": "application/json",
          ...headers,
        });
        res.end(JSON.stringify(payload));
      };

      if (url.pathname === "/connect/token") {
        send(200, {
          access_token: "access-123",
          refresh_token: "refresh-456",
          expires_in: 3600,
          scope: "accounts",
          token_type: "Bearer",
        });
        return;
      }
      if (url.pathname === "/data/v1/accounts") {
        send(200, {
          results: [
            {
              account_id: "acc-1",
              display_name: "Everyday",
              account_type: "TRANSACTION",
              currency: "GBP",
            },
          ],
        });
        return;
      }
      if (url.pathname === "/data/v1/cards") {
        send(200, {
          results: [
            {
              account_id: "card-1",
              display_name: "Rewards Card",
              currency: "GBP",
            },
          ],
        });
        return;
      }
      if (url.pathname === "/data/v1/accounts/acc-1/balance") {
        send(200, { results: [{ current: 1542.1, available: 1500 }] });
        return;
      }
      if (url.pathname === "/data/v1/cards/card-1/balance") {
        send(200, { results: [{ current: -230.5 }] });
        return;
      }

      if (options?.transactionHandler) {
        const handled = options.transactionHandler(url);
        if (handled) {
          send(handled.code, handled.payload);
          return;
        }
      }

      if (url.pathname === "/data/v1/accounts/acc-1/transactions") {
        send(200, {
          results: [
            {
              transaction_id: "tx-1",
              timestamp: "2026-07-10T09:30:00Z",
              description: "Tesco",
              amount: -12.5,
              currency: "GBP",
              merchant_name: "Tesco",
            },
          ],
        });
        return;
      }
      // A card id is not a bank account, so the account path 404s and the
      // provider retries via the cards path.
      if (url.pathname === "/data/v1/accounts/card-1/transactions") {
        send(404, { error: "not_found" });
        return;
      }
      if (url.pathname === "/data/v1/cards/card-1/transactions") {
        send(200, {
          results: [
            {
              transaction_id: "ctx-1",
              timestamp: "2026-07-11T12:00:00Z",
              description: "Amazon",
              amount: -40.0,
              currency: "GBP",
            },
          ],
        });
        return;
      }
      if (url.pathname === "/data/v1/accounts/unauthorized/transactions") {
        send(401, { error: "unauthorized" });
        return;
      }
      send(404, { error: "not_found" });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, requests });
    });
  });
}

describe("TrueLayerProvider (live network path against a mock)", () => {
  let mock: Awaited<ReturnType<typeof startMockTrueLayer>>;
  let provider: TrueLayerProvider;

  beforeAll(async () => {
    mock = await startMockTrueLayer();
    provider = new TrueLayerProvider({
      clientId: "client",
      clientSecret: "secret",
      authBaseUrl: mock.baseUrl,
      apiBaseUrl: mock.baseUrl,
    });
  });

  afterAll(() => {
    mock.server.close();
  });

  it("builds an auth URL with the expected params", async () => {
    const url = await provider.createAuthUrl({
      state: "st",
      redirectUri: "https://app/cb",
      connectionType: "bank_account",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("client");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app/cb");
    expect(parsed.searchParams.get("state")).toBe("st");
  });

  it("exchanges an auth code for tokens", async () => {
    const tokens = await provider.exchangeAuthCode({
      code: "code",
      redirectUri: "https://app/cb",
    });
    expect(tokens.accessToken).toBe("access-123");
    expect(tokens.refreshToken).toBe("refresh-456");
    expect(tokens.expiresAt).toBeDefined();
  });

  it("lists accounts + cards with balances", async () => {
    const accounts = await provider.listAccounts({
      tokens: { accessToken: "access-123", refreshToken: "r" },
    });
    expect(accounts).toHaveLength(2);
    const acc = accounts.find((a) => a.providerAccountId === "acc-1");
    expect(acc?.accountType).toBe("transaction");
    expect(acc?.balanceMinor).toBe(154210);
    const card = accounts.find((a) => a.providerAccountId === "card-1");
    expect(card?.accountType).toBe("credit_card");
    expect(card?.balanceMinor).toBe(-23050);
  });

  it("lists account transactions (single page)", async () => {
    const txns = await provider.listTransactions({
      tokens: { accessToken: "access-123", refreshToken: "r" },
      providerAccountId: "acc-1",
      from: "2026-07-01",
      to: "2026-07-17",
    });
    expect(txns).toHaveLength(1);
    expect(txns[0]?.amountMinor).toBe(-1250);
    expect(txns[0]?.merchantName).toBe("Tesco");
  });

  it("falls back to the card path when the account path 404s", async () => {
    const txns = await provider.listTransactions({
      tokens: { accessToken: "access-123", refreshToken: "r" },
      providerAccountId: "card-1",
      from: "2026-07-01",
      to: "2026-07-17",
    });
    expect(txns).toHaveLength(1);
    expect(txns[0]?.providerTransactionId).toBe("ctx-1");
  });

  it("throws AuthorizationError on a 401 response", async () => {
    await expect(
      provider.listTransactions({
        tokens: { accessToken: "bad", refreshToken: "r" },
        providerAccountId: "unauthorized",
        from: "2026-07-01",
        to: "2026-07-17",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("sends the bearer token on data requests", async () => {
    mock.requests.length = 0;
    await provider.listAccounts({
      tokens: { accessToken: "access-xyz", refreshToken: "r" },
    });
    const dataReq = mock.requests.find((r) => r.path === "/data/v1/accounts");
    expect(dataReq?.auth).toBe("Bearer access-xyz");
  });
});

describe("TrueLayerProvider transaction pagination", () => {
  it("returns an empty list when there are no results", async () => {
    const mock = await startMockTrueLayer({
      transactionHandler: (url) => {
        if (url.pathname === "/data/v1/accounts/acc-empty/transactions") {
          return { code: 200, payload: { results: [] } };
        }
        if (url.pathname === "/data/v1/cards/acc-empty/transactions") {
          return { code: 200, payload: { results: [] } };
        }
        return undefined;
      },
    });
    const provider = new TrueLayerProvider({
      clientId: "client",
      clientSecret: "secret",
      authBaseUrl: mock.baseUrl,
      apiBaseUrl: mock.baseUrl,
    });

    const txns = await provider.listTransactions({
      tokens: { accessToken: "access-123", refreshToken: "r" },
      providerAccountId: "acc-empty",
      from: "2026-01-01",
      to: "2026-07-01",
    });
    expect(txns).toEqual([]);
    mock.server.close();
  });

  it("follows pagination.next_cursor across multiple pages", async () => {
    const logs: string[] = [];
    const mock = await startMockTrueLayer({
      transactionHandler: (url) => {
        if (url.pathname !== "/data/v1/accounts/acc-multi/transactions") {
          return undefined;
        }
        const cursor = url.searchParams.get("cursor");
        if (!cursor) {
          return {
            code: 200,
            payload: {
              results: [
                {
                  transaction_id: "tx-p1",
                  timestamp: "2026-07-10T09:30:00Z",
                  description: "Page1",
                  amount: -1,
                  currency: "GBP",
                },
              ],
              pagination: { next_cursor: "cursor-2" },
            },
          };
        }
        if (cursor === "cursor-2") {
          return {
            code: 200,
            payload: {
              results: [
                {
                  transaction_id: "tx-p2",
                  timestamp: "2026-07-09T09:30:00Z",
                  description: "Page2",
                  amount: -2,
                  currency: "GBP",
                },
              ],
              pagination: { next_cursor: "cursor-3" },
            },
          };
        }
        if (cursor === "cursor-3") {
          return {
            code: 200,
            payload: {
              results: [
                {
                  transaction_id: "tx-p3",
                  timestamp: "2026-07-08T09:30:00Z",
                  description: "Page3",
                  amount: -3,
                  currency: "GBP",
                },
              ],
            },
          };
        }
        return { code: 500, payload: { error: "unexpected cursor" } };
      },
    });
    const provider = new TrueLayerProvider({
      clientId: "client",
      clientSecret: "secret",
      authBaseUrl: mock.baseUrl,
      apiBaseUrl: mock.baseUrl,
      logger: { info: (m) => logs.push(m) },
    });

    const txns = await provider.listTransactions({
      tokens: { accessToken: "access-123", refreshToken: "r" },
      providerAccountId: "acc-multi",
      from: "2026-01-01",
      to: "2026-07-20",
    });

    expect(txns.map((t) => t.providerTransactionId)).toEqual([
      "tx-p1",
      "tx-p2",
      "tx-p3",
    ]);
    const pageReqs = mock.requests.filter(
      (r) => r.path === "/data/v1/accounts/acc-multi/transactions",
    );
    expect(pageReqs).toHaveLength(3);
    expect(pageReqs[1]?.search).toContain("cursor=cursor-2");
    expect(pageReqs[2]?.search).toContain("cursor=cursor-3");
    expect(logs.some((l) => /3 pages/.test(l))).toBe(true);
    expect(logs.every((l) => !/tx-p1|Page1|access-123/.test(l))).toBe(true);
    mock.server.close();
  });

  it("aborts when pagination returns a repeated cursor", async () => {
    const mock = await startMockTrueLayer({
      transactionHandler: (url) => {
        if (url.pathname !== "/data/v1/accounts/acc-loop/transactions") {
          return undefined;
        }
        return {
          code: 200,
          payload: {
            results: [
              {
                transaction_id: "tx-loop",
                timestamp: "2026-07-10T09:30:00Z",
                description: "Loop",
                amount: -1,
                currency: "GBP",
              },
            ],
            pagination: { next_cursor: "same-cursor" },
          },
        };
      },
    });
    const provider = new TrueLayerProvider({
      clientId: "client",
      clientSecret: "secret",
      authBaseUrl: mock.baseUrl,
      apiBaseUrl: mock.baseUrl,
    });

    await expect(
      provider.listTransactions({
        tokens: { accessToken: "access-123", refreshToken: "r" },
        providerAccountId: "acc-loop",
        from: "2026-01-01",
        to: "2026-07-20",
      }),
    ).rejects.toThrow(/repeated cursor/);
    mock.server.close();
  });

  it("aborts when pagination exceeds the max page guard", async () => {
    const mock = await startMockTrueLayer({
      transactionHandler: (url) => {
        if (url.pathname !== "/data/v1/accounts/acc-max/transactions") {
          return undefined;
        }
        const cursor = url.searchParams.get("cursor");
        const n = cursor ? Number(cursor) : 0;
        return {
          code: 200,
          payload: {
            results: [
              {
                transaction_id: `tx-${n}`,
                timestamp: "2026-07-10T09:30:00Z",
                description: "Max",
                amount: -1,
                currency: "GBP",
              },
            ],
            pagination: { next_cursor: String(n + 1) },
          },
        };
      },
    });
    const provider = new TrueLayerProvider({
      clientId: "client",
      clientSecret: "secret",
      authBaseUrl: mock.baseUrl,
      apiBaseUrl: mock.baseUrl,
    });

    await expect(
      provider.listTransactions({
        tokens: { accessToken: "access-123", refreshToken: "r" },
        providerAccountId: "acc-max",
        from: "2026-01-01",
        to: "2026-07-20",
      }),
    ).rejects.toThrow(new RegExp(`exceeded ${MAX_TRANSACTION_PAGES} pages`));
    mock.server.close();
  });
});

describe("parseDataApiPage", () => {
  it("reads nested pagination.next_cursor", () => {
    const page = parseDataApiPage(
      { results: [1], pagination: { next_cursor: "abc" } },
      null,
      "https://api.truelayer.com",
    );
    expect(page.nextCursor).toBe("abc");
    expect(page.results).toEqual([1]);
  });

  it("reads Link rel=next into nextPath", () => {
    const page = parseDataApiPage(
      { results: [] },
      '<https://api.truelayer.com/data/v1/accounts/x/transactions?cursor=z>; rel="next"',
      "https://api.truelayer.com",
    );
    expect(page.nextPath).toBe(
      "/data/v1/accounts/x/transactions?cursor=z",
    );
  });
});
