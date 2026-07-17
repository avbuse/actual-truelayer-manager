import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createActualClient,
  resolveActualCredentials,
} from "./actual/factory.js";
import type { ActualClient } from "./actual/actualClient.js";
import type { AppConfig } from "./config/env.js";
import { loadEncryptor } from "./config/secrets.js";
import { createEncryptor, type Encryptor } from "./crypto/encrypt.js";
import { openDatabase, type Db } from "./db/index.js";
import { ActualRepo } from "./db/repositories/actual.repo.js";
import { ConnectionsRepo } from "./db/repositories/connections.repo.js";
import { MappingsRepo } from "./db/repositories/mappings.repo.js";
import { SettingsRepo } from "./db/repositories/settings.repo.js";
import { SyncRunsRepo } from "./db/repositories/syncRuns.repo.js";
import { LogBuffer } from "./logging/logBuffer.js";
import { createProvider } from "./providers/registry.js";
import type { BankingProvider } from "./providers/bankingProvider.js";
import { SyncRunner } from "./sync/syncRunner.js";

export interface Services {
  config: AppConfig;
  db: Db;
  encryptor: Encryptor | null;
  settings: SettingsRepo;
  actualRepo: ActualRepo;
  connections: ConnectionsRepo;
  mappings: MappingsRepo;
  syncRuns: SyncRunsRepo;
  provider: BankingProvider;
  logs: LogBuffer;
  getActualClient(): ActualClient;
  createSyncRunner(): SyncRunner;
  close(): void;
}

/**
 * In demo mode without a configured key, generate/persist an ephemeral key so
 * the (fake) tokens can still be stored encrypted rather than in plaintext.
 */
function resolveEncryptor(config: AppConfig): Encryptor | null {
  const configured = loadEncryptor();
  if (configured) return configured;
  if (!config.demoMode) return null;

  mkdirSync(config.dataDir, { recursive: true });
  const keyPath = join(config.dataDir, "demo-encryption.key");
  let key: string;
  if (existsSync(keyPath)) {
    key = readFileSync(keyPath, "utf8").trim();
  } else {
    key = randomBytes(32).toString("base64");
    writeFileSync(keyPath, key, { mode: 0o600 });
  }
  return createEncryptor(key);
}

export function buildServices(config: AppConfig): Services {
  const db = openDatabase(config.dbPath);
  const encryptor = resolveEncryptor(config);
  const logs = new LogBuffer();

  const settings = new SettingsRepo(db);
  const actualRepo = new ActualRepo(db);
  const connections = new ConnectionsRepo(db, encryptor);
  const mappings = new MappingsRepo(db);
  const syncRuns = new SyncRunsRepo(db);
  const provider = createProvider(config);

  let cachedActual: ActualClient | null = null;

  const getActualClient = (): ActualClient => {
    if (cachedActual) return cachedActual;
    const credentials = resolveActualCredentials(
      config,
      actualRepo.get(),
      (value) => (encryptor ? encryptor.decrypt(value) : value),
    );
    cachedActual = createActualClient(config, credentials);
    return cachedActual;
  };

  const createSyncRunner = (): SyncRunner =>
    new SyncRunner({
      config,
      provider,
      actual: getActualClient(),
      connections,
      mappings,
      syncRuns,
      logger: { info: (m) => logs.info(m), warn: (m) => logs.warn(m) },
    });

  return {
    config,
    db,
    encryptor,
    settings,
    actualRepo,
    connections,
    mappings,
    syncRuns,
    provider,
    logs,
    getActualClient,
    createSyncRunner,
    close: () => db.close(),
  };
}
