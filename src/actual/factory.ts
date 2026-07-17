import type { AppConfig } from "../config/env.js";
import type { ActualConfigRow } from "../db/types.js";
import type { ActualClient } from "./actualClient.js";
import { DemoActualClient } from "./demoActualClient.js";
import { RealActualClient } from "./realActualClient.js";

export interface ActualCredentials {
  serverUrl: string;
  password: string;
  syncId: string;
  encryptionPassword?: string;
}

/**
 * Builds an {@link ActualClient}. Returns the demo client in demo mode;
 * otherwise a live `@actual-app/api`-backed client using the supplied
 * credentials.
 */
export function createActualClient(
  config: AppConfig,
  credentials: ActualCredentials | null,
): ActualClient {
  if (config.demoMode || !credentials) {
    return new DemoActualClient();
  }
  return new RealActualClient(credentials, config.dataDir);
}

/** Merges stored config with environment overrides into usable credentials. */
export function resolveActualCredentials(
  config: AppConfig,
  stored: ActualConfigRow | undefined,
  decrypt: (value: string) => string,
): ActualCredentials | null {
  const serverUrl = config.actual.serverUrl ?? stored?.server_url;
  const syncId = config.actual.syncId ?? stored?.sync_id;
  const password =
    config.actual.password ??
    (stored?.password_encrypted ? decrypt(stored.password_encrypted) : undefined);
  const encryptionPassword =
    config.actual.encryptionPassword ??
    (stored?.encryption_password_encrypted
      ? decrypt(stored.encryption_password_encrypted)
      : undefined);

  if (!serverUrl || !syncId || !password) {
    return null;
  }
  return { serverUrl, syncId, password, encryptionPassword };
}
