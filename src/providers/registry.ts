import type { AppConfig } from "../config/env.js";
import type { BankingProvider } from "./bankingProvider.js";
import { DemoProvider } from "./demo/demoProvider.js";
import { TrueLayerProvider } from "./truelayer/truelayerProvider.js";

/**
 * Selects the active banking provider. Uses the built-in demo provider unless
 * live TrueLayer credentials are configured and demo mode is off.
 */
export function createProvider(config: AppConfig): BankingProvider {
  if (
    !config.demoMode &&
    config.truelayer.clientId &&
    config.truelayer.clientSecret
  ) {
    return new TrueLayerProvider({
      clientId: config.truelayer.clientId,
      clientSecret: config.truelayer.clientSecret,
    });
  }
  return new DemoProvider();
}
