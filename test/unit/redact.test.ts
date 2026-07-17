import { describe, expect, it } from "vitest";
import { redactString, redactValue, REDACTED } from "../../src/crypto/redact.js";

describe("redactString", () => {
  it("redacts OAuth code and tokens in query strings / callback URLs", () => {
    const url =
      "https://console.truelayer.com/redirect-page?code=abc123secret&state=xyz";
    const out = redactString(url);
    expect(out).not.toContain("abc123secret");
    expect(out).toContain(`code=${REDACTED}`);
    expect(out).toContain("state=xyz");
  });

  it("redacts access_token and refresh_token query params", () => {
    const out = redactString("access_token=aaa&refresh_token=bbb");
    expect(out).toBe(`access_token=${REDACTED}&refresh_token=${REDACTED}`);
  });

  it("redacts JSON secret fields", () => {
    const json = '{"client_secret":"shh","password":"pw","keep":"me"}';
    const out = redactString(json);
    expect(out).not.toContain("shh");
    expect(out).not.toContain('"pw"');
    expect(out).toContain('"keep":"me"');
  });

  it("redacts Authorization: Bearer headers", () => {
    const out = redactString("Authorization: Bearer eyJhbGciOi.J9.sig");
    expect(out).toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it("masks known secret literals anywhere they appear", () => {
    const out = redactString("the value is s3cr3tValue here", ["s3cr3tValue"]);
    expect(out).toBe(`the value is ${REDACTED} here`);
  });
});

describe("redactValue", () => {
  it("redacts sensitive object keys and nested values", () => {
    const input = {
      client_secret: "shh",
      nested: { access_token: "tok", note: "fine" },
      list: ["client_secret=leak"],
    };
    const out = redactValue(input);
    expect(out.client_secret).toBe(REDACTED);
    expect(out.nested.access_token).toBe(REDACTED);
    expect(out.nested.note).toBe("fine");
    expect(out.list[0]).toBe(`client_secret=${REDACTED}`);
  });

  it("leaves non-sensitive primitives untouched", () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBe(null);
  });
});
