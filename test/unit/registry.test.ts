import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";
import { createEncryptor } from "../../src/crypto/encrypt.js";
import {
  createProvider,
  resolveTrueLayerConfig,
  type SettingsReader,
} from "../../src/providers/registry.js";
import { TrueLayerProvider } from "../../src/providers/truelayer/truelayerProvider.js";
import { DemoProvider } from "../../src/providers/demo/demoProvider.js";

function settingsFrom(map: Record<string, string>): SettingsReader {
  return { get: (key) => map[key] };
}

describe("resolveTrueLayerConfig", () => {
  const enc = createEncryptor(randomBytes(32).toString("base64"));
  const decrypt = (v: string): string => enc.decrypt(v);

  it("returns null when nothing is configured", () => {
    const config = loadConfig({});
    expect(resolveTrueLayerConfig(config, settingsFrom({}), decrypt)).toBeNull();
  });

  it("reads client id + secret saved through the wizard", () => {
    const config = loadConfig({});
    const settings = settingsFrom({
      "truelayer.client_id": "ui-client",
      "truelayer.client_secret_enc": enc.encrypt("ui-secret"),
    });
    const resolved = resolveTrueLayerConfig(config, settings, decrypt);
    expect(resolved).toMatchObject({
      clientId: "ui-client",
      clientSecret: "ui-secret",
    });
  });

  it("prefers environment values and passes sandbox flags through", () => {
    const config = loadConfig({
      TRUELAYER_CLIENT_ID: "env-client",
      TRUELAYER_CLIENT_SECRET: "env-secret",
      TRUELAYER_USE_SANDBOX: "true",
    });
    const resolved = resolveTrueLayerConfig(
      config,
      settingsFrom({ "truelayer.client_id": "ui-client" }),
      decrypt,
    );
    expect(resolved).toMatchObject({
      clientId: "env-client",
      clientSecret: "env-secret",
      useSandbox: true,
    });
  });
});

describe("createProvider", () => {
  it("uses the live provider when creds resolve and demo is not forced", () => {
    const config = loadConfig({
      TRUELAYER_CLIENT_ID: "id",
      ACTUAL_SERVER_URL: "http://actual:5006",
    });
    const provider = createProvider(config, {
      clientId: "id",
      clientSecret: "secret",
      useSandbox: false,
    });
    expect(provider).toBeInstanceOf(TrueLayerProvider);
  });

  it("falls back to demo when no creds resolve", () => {
    const config = loadConfig({});
    expect(createProvider(config, null)).toBeInstanceOf(DemoProvider);
  });

  it("forces demo when DEMO_MODE=1 even with creds", () => {
    const config = loadConfig({
      DEMO_MODE: "1",
      TRUELAYER_CLIENT_ID: "id",
      ACTUAL_SERVER_URL: "http://actual:5006",
    });
    const provider = createProvider(config, {
      clientId: "id",
      clientSecret: "secret",
      useSandbox: false,
    });
    expect(provider).toBeInstanceOf(DemoProvider);
  });
});
