import { describe, expect, it } from "vitest";
import { parseRedirectUrl } from "../../src/providers/truelayer/auth.js";
import { DemoProvider } from "../../src/providers/demo/demoProvider.js";

describe("parseRedirectUrl", () => {
  it("extracts code and state from the query string", () => {
    const parsed = parseRedirectUrl(
      "https://console.truelayer.com/redirect-page?code=abc123&state=s1",
    );
    expect(parsed.code).toBe("abc123");
    expect(parsed.state).toBe("s1");
  });

  it("extracts code from the fragment", () => {
    const parsed = parseRedirectUrl("https://app.example/cb#code=xyz&state=s2");
    expect(parsed.code).toBe("xyz");
  });

  it("throws when no code is present", () => {
    expect(() => parseRedirectUrl("https://app.example/cb?state=only")).toThrow(
      /code/,
    );
  });

  it("throws on an invalid URL", () => {
    expect(() => parseRedirectUrl("not a url")).toThrow(/valid URL/);
  });
});

describe("DemoProvider", () => {
  it("lists accounts and generates transactions", async () => {
    const provider = new DemoProvider();
    const tokens = await provider.exchangeAuthCode({
      code: "c",
      redirectUri: "r",
    });
    const accounts = await provider.listAccounts({ tokens });
    expect(accounts.length).toBeGreaterThan(0);

    const txns = await provider.listTransactions({
      tokens,
      providerAccountId: "demo-current",
      from: "2026-01-01",
      to: "2026-01-08",
    });
    expect(txns.length).toBeGreaterThan(0);
    expect(txns[0]?.providerTransactionId).toBeTruthy();
  });
});
