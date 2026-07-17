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

export interface AppConfig {
  bindHost: string;
  port: number;
  baseUrl: string;
  logLevel: string;
  syncIntervalHours: number;
  syncOverlapDays: number;
  dataDir: string;
}

/**
 * Loads application configuration from the environment, applying the defaults
 * documented in the project spec (section 8.1).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = parseIntWithDefault(readEnvOrFile("APP_PORT", env), 3020);

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
    dataDir: readEnvOrFile("APP_DATA_DIR", env) ?? "/app/data",
  };
}
