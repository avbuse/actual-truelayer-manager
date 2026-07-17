import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import formbody from "@fastify/formbody";
import { loadConfig, type AppConfig } from "./config/env.js";
import { buildServices, type Services } from "./services.js";
import { healthRoutes } from "./server/routes/health.routes.js";
import { statusRoutes } from "./server/routes/status.routes.js";
import { setupRoutes } from "./server/routes/setup.routes.js";
import { dashboardRoutes } from "./server/routes/dashboard.routes.js";
import { connectionsRoutes } from "./server/routes/connections.routes.js";
import { mappingsRoutes } from "./server/routes/mappings.routes.js";
import { syncRoutes } from "./server/routes/sync.routes.js";
import { logsRoutes } from "./server/routes/logs.routes.js";

export interface BuildAppOptions {
  logLevel?: string;
  config?: AppConfig;
  services?: Services;
}

/** Ephemeral demo config used by tests when none is supplied. */
function defaultTestConfig(): AppConfig {
  const dir = mkdtempSync(join(tmpdir(), "atm-test-"));
  return loadConfig({
    DEMO_MODE: "1",
    APP_DATA_DIR: dir,
    APP_DB_PATH: ":memory:",
  });
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logLevel
      ? {
          level: options.logLevel,
          redact: {
            censor: "***",
            paths: [
              "req.headers.authorization",
              "*.access_token",
              "*.refresh_token",
              "*.client_secret",
              "*.password",
              "*.encryption_password",
            ],
          },
        }
      : false,
  });

  const ownsServices = !options.services;
  const services =
    options.services ?? buildServices(options.config ?? defaultTestConfig());

  await app.register(formbody);

  await app.register(async (instance) => healthRoutes(instance));
  await app.register(async (instance) => statusRoutes(instance, services));
  await app.register(async (instance) => setupRoutes(instance, services));
  await app.register(async (instance) => dashboardRoutes(instance, services));
  await app.register(async (instance) => connectionsRoutes(instance, services));
  await app.register(async (instance) => mappingsRoutes(instance, services));
  await app.register(async (instance) => syncRoutes(instance, services));
  await app.register(async (instance) => logsRoutes(instance, services));

  if (ownsServices) {
    app.addHook("onClose", async () => {
      services.close();
    });
  }

  return app;
}
