import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, readEnvOrFile } from "../../src/config/env.js";

describe("readEnvOrFile", () => {
  it("returns the direct value when only the variable is set", () => {
    expect(readEnvOrFile("FOO", { FOO: "bar" })).toBe("bar");
  });

  it("reads from the _FILE path when provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "atm-env-"));
    const file = join(dir, "secret");
    writeFileSync(file, "s3cr3t\n");
    expect(readEnvOrFile("FOO", { FOO_FILE: file })).toBe("s3cr3t");
  });

  it("throws when both the variable and its _FILE are set", () => {
    expect(() =>
      readEnvOrFile("FOO", { FOO: "bar", FOO_FILE: "/tmp/x" }),
    ).toThrow(/only one/);
  });

  it("treats an empty string as unset", () => {
    expect(readEnvOrFile("FOO", { FOO: "" })).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("applies documented defaults", () => {
    const config = loadConfig({});
    expect(config.bindHost).toBe("127.0.0.1");
    expect(config.port).toBe(3020);
    expect(config.baseUrl).toBe("http://localhost:3020");
    expect(config.syncOverlapDays).toBe(3);
    expect(config.syncIntervalHours).toBe(0);
  });

  it("honours overrides", () => {
    const config = loadConfig({ APP_PORT: "4000", APP_BIND_HOST: "0.0.0.0" });
    expect(config.port).toBe(4000);
    expect(config.bindHost).toBe("0.0.0.0");
    expect(config.baseUrl).toBe("http://localhost:4000");
  });

  it("throws on a non-numeric port", () => {
    expect(() => loadConfig({ APP_PORT: "not-a-number" })).toThrow(/integer/);
  });

  it("auto-detects demo mode when no live creds are present", () => {
    expect(loadConfig({}).demoMode).toBe(true);
    expect(loadConfig({}).demoForced).toBeUndefined();
  });

  it("goes live automatically when TrueLayer + Actual are configured", () => {
    const config = loadConfig({
      TRUELAYER_CLIENT_ID: "id",
      ACTUAL_SERVER_URL: "http://actual:5006",
    });
    expect(config.demoMode).toBe(false);
  });

  it("honours an explicit DEMO_MODE override", () => {
    const forcedDemo = loadConfig({
      DEMO_MODE: "1",
      TRUELAYER_CLIENT_ID: "id",
      ACTUAL_SERVER_URL: "http://actual:5006",
    });
    expect(forcedDemo.demoMode).toBe(true);
    expect(forcedDemo.demoForced).toBe(true);

    const forcedLive = loadConfig({ DEMO_MODE: "0" });
    expect(forcedLive.demoMode).toBe(false);
    expect(forcedLive.demoForced).toBe(false);
  });

  it("parses TrueLayer sandbox and base-url overrides", () => {
    const config = loadConfig({
      TRUELAYER_USE_SANDBOX: "true",
      TRUELAYER_AUTH_BASE_URL: "https://auth.example",
      TRUELAYER_API_BASE_URL: "https://api.example",
    });
    expect(config.truelayer.useSandbox).toBe(true);
    expect(config.truelayer.authBaseUrl).toBe("https://auth.example");
    expect(config.truelayer.apiBaseUrl).toBe("https://api.example");
  });

  it("parses basic-auth credentials", () => {
    const config = loadConfig({
      APP_BASIC_AUTH_USER: "admin",
      APP_BASIC_AUTH_PASSWORD: "pw",
    });
    expect(config.basicAuth.user).toBe("admin");
    expect(config.basicAuth.password).toBe("pw");
  });
});
