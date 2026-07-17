import Fastify, { type FastifyInstance } from "fastify";
import formbody from "@fastify/formbody";
import { healthRoutes } from "./server/routes/health.routes.js";
import { statusRoutes } from "./server/routes/status.routes.js";
import { setupRoutes } from "./server/routes/setup.routes.js";

export interface BuildAppOptions {
  logLevel?: string;
}

/**
 * Builds the Fastify application with all routes registered but without binding
 * to a network port. Kept separate from `index.ts` so tests can exercise the
 * app in-process via `app.inject(...)`.
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logLevel
      ? {
          level: options.logLevel,
          // Defence in depth: never emit secrets even if something logs them.
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

  await app.register(formbody);

  await app.register(healthRoutes);
  await app.register(statusRoutes);
  await app.register(setupRoutes);

  return app;
}
