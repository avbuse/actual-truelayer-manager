import type { AppConfig } from "../config/env.js";
import type { BankingProvider } from "./bankingProvider.js";
import { DemoProvider } from "./demo/demoProvider.js";
import {
  TrueLayerProvider,
  type TrueLayerConfig,
} from "./truelayer/truelayerProvider.js";

export interface SettingsReader {
  get(key: string): string | undefined;
}

/**
 * Resolves usable TrueLayer credentials by merging environment variables with
 * values saved through the setup wizard (stored in `settings`). The client
 * secret is stored encrypted, so a `decrypt` function is required to read it.
 * Returns `null` when no complete credential pair is available.
 */
export function resolveTrueLayerConfig(
  config: AppConfig,
  settings: SettingsReader,
  decrypt: (value: string) => string,
): TrueLayerConfig | null {
  const clientId =
    config.truelayer.clientId ?? settings.get("truelayer.client_id");

  const storedSecret = settings.get("truelayer.client_secret_enc");
  const clientSecret =
    config.truelayer.clientSecret ??
    (storedSecret ? decrypt(storedSecret) : undefined);

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    useSandbox: config.truelayer.useSandbox,
    authBaseUrl: config.truelayer.authBaseUrl,
    apiBaseUrl: config.truelayer.apiBaseUrl,
  };
}

/**
 * Selects the active banking provider. Uses the built-in demo provider when
 * demo mode is explicitly forced or when no live TrueLayer credentials are
 * available; otherwise the live TrueLayer provider.
 */
export function createProvider(
  config: AppConfig,
  resolved: TrueLayerConfig | null,
  options?: { logger?: TrueLayerConfig["logger"] },
): BankingProvider {
  if (config.demoForced === true) {
    return new DemoProvider();
  }
  if (resolved) {
    return new TrueLayerProvider({
      ...resolved,
      logger: options?.logger ?? resolved.logger,
    });
  }
  return new DemoProvider();
}
