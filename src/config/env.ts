import { readFileSync } from "node:fs";

/**
 * Reads a configuration value that may be provided either directly via an
 * environment variable or indirectly via a `<NAME>_FILE` variable pointing at a
 * file (Docker/Podman secret style). Providing both is a fatal misconfiguration.
 */
export function readEnvOrFile(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const direct = env[name];
  const fileVar = env[`${name}_FILE`];

  if (direct !== undefined && direct !== "" && fileVar) {
    throw new Error(
      `Both ${name} and ${name}_FILE are set. Provide only one of them.`,
    );
  }

  if (fileVar) {
    try {
      return readFileSync(fileVar, "utf8").trim();
    } catch (cause) {
      throw new Error(`Failed to read ${name}_FILE at "${fileVar}"`, { cause });
    }
  }

  return direct === "" ? undefined : direct;
}

function parseIntWithDefault(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected an integer but received "${value}"`);
  }
  return parsed;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export interface AppConfig {
  bindHost: string;
  port: number;
  baseUrl: string;
  logLevel: string;
  syncIntervalHours: number;
  syncOverlapDays: number;
  syncDaysLookback: number;
  balanceDriftWarningMinor: number;
  consentExpiryWarningDays: number;
  dataDir: string;
  dbPath: string;
  /**
   * When true, the app uses built-in simulated TrueLayer + Actual backends so
   * the full flow can be exercised without live credentials. Defaults to true
   * unless live credentials are provided (or DEMO_MODE is explicitly set).
   */
  demoMode: boolean;
  /**
   * The explicit `DEMO_MODE` env override, if the operator set one. `true`
   * forces demo backends; `false` forces live backends whenever real
   * credentials are available. `undefined` means "auto-detect" (the default).
   */
  demoForced?: boolean;
  actual: {
    serverUrl?: string;
    password?: string;
    encryptionPassword?: string;
    syncId?: string;
  };
  truelayer: {
    clientId?: string;
    clientSecret?: string;
    redirectMode: "manual" | "direct";
    callbackUrl?: string;
    useSandbox: boolean;
    authBaseUrl?: string;
    apiBaseUrl?: string;
  };
  basicAuth: {
    user?: string;
    password?: string;
  };
}

/**
 * Loads application configuration from the environment, applying the defaults
 * documented in the project spec (section 8.1).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = parseIntWithDefault(readEnvOrFile("APP_PORT", env), 3020);
  const dataDir = readEnvOrFile("APP_DATA_DIR", env) ?? "/app/data";

  const actual = {
    serverUrl: readEnvOrFile("ACTUAL_SERVER_URL", env),
    password: readEnvOrFile("ACTUAL_PASSWORD", env),
    encryptionPassword: readEnvOrFile("ACTUAL_ENCRYPTION_PASSWORD", env),
    syncId: readEnvOrFile("ACTUAL_SYNC_ID", env),
  };
  const truelayer = {
    clientId: readEnvOrFile("TRUELAYER_CLIENT_ID", env),
    clientSecret: readEnvOrFile("TRUELAYER_CLIENT_SECRET", env),
    redirectMode:
      readEnvOrFile("TRUELAYER_REDIRECT_MODE", env) === "direct"
        ? ("direct" as const)
        : ("manual" as const),
    callbackUrl: readEnvOrFile("TRUELAYER_CALLBACK_URL", env),
    useSandbox: parseBool(readEnvOrFile("TRUELAYER_USE_SANDBOX", env), false),
    authBaseUrl: readEnvOrFile("TRUELAYER_AUTH_BASE_URL", env),
    apiBaseUrl: readEnvOrFile("TRUELAYER_API_BASE_URL", env),
  };

  const hasLiveCreds = Boolean(truelayer.clientId && actual.serverUrl);
  const demoRaw = readEnvOrFile("DEMO_MODE", env);
  const demoForced = demoRaw === undefined ? undefined : parseBool(demoRaw, false);
  const demoMode = demoForced ?? !hasLiveCreds;

  return {
    bindHost: readEnvOrFile("APP_BIND_HOST", env) ?? "127.0.0.1",
    port,
    baseUrl: readEnvOrFile("APP_BASE_URL", env) ?? `http://localhost:${port}`,
    logLevel: readEnvOrFile("LOG_LEVEL", env) ?? "info",
    syncIntervalHours: parseIntWithDefault(
      readEnvOrFile("SYNC_INTERVAL_HOURS", env),
      0,
    ),
    syncOverlapDays: parseIntWithDefault(
      readEnvOrFile("SYNC_OVERLAP_DAYS", env),
      3,
    ),
    syncDaysLookback: parseIntWithDefault(
      readEnvOrFile("SYNC_DAYS_LOOKBACK", env),
      7,
    ),
    balanceDriftWarningMinor: parseIntWithDefault(
      readEnvOrFile("BALANCE_DRIFT_WARNING_MINOR", env),
      100,
    ),
    consentExpiryWarningDays: parseIntWithDefault(
      readEnvOrFile("CONSENT_EXPIRY_WARNING_DAYS", env),
      14,
    ),
    dataDir,
    dbPath: readEnvOrFile("APP_DB_PATH", env) ?? `${dataDir}/sync.db`,
    demoMode,
    demoForced,
    actual,
    truelayer,
    basicAuth: {
      user: readEnvOrFile("APP_BASIC_AUTH_USER", env),
      password: readEnvOrFile("APP_BASIC_AUTH_PASSWORD", env),
    },
  };
}
