import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface LegacyDetection {
  found: boolean;
  source: "truelayer2actual" | "actual-truelayer-sync" | "unknown" | "none";
  files: string[];
}

/**
 * Detects legacy configuration files from the two upstream projects (spec §18)
 * so the UI can offer to back them up and import them. Detection is read-only
 * and never mutates or deletes the originals.
 */
export function detectLegacyConfig(dataDir: string): LegacyDetection {
  const config = join(dataDir, "config.json");
  const tokens = join(dataDir, "tokens.json");
  const state = join(dataDir, "state.json");

  const files: string[] = [];
  if (existsSync(config)) files.push("config.json");
  if (existsSync(tokens)) files.push("tokens.json");
  if (existsSync(state)) files.push("state.json");

  if (files.length === 0) {
    return { found: false, source: "none", files };
  }

  let source: LegacyDetection["source"] = "unknown";
  if (existsSync(tokens)) source = "truelayer2actual";
  else if (existsSync(state)) source = "actual-truelayer-sync";

  return { found: true, source, files };
}

export interface LegacyConfigSummary {
  detection: LegacyDetection;
  keys: string[];
}

/** Parses the legacy config.json (if present) and returns a safe summary. */
export function summariseLegacyConfig(dataDir: string): LegacyConfigSummary {
  const detection = detectLegacyConfig(dataDir);
  const configPath = join(dataDir, "config.json");
  let keys: string[] = [];
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<
        string,
        unknown
      >;
      keys = Object.keys(parsed);
    } catch {
      keys = [];
    }
  }
  return { detection, keys };
}
