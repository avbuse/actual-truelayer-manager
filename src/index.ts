import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { buildServices } from "./services.js";
import { Scheduler } from "./sync/scheduler.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const services = buildServices(config);
  const app = await buildApp({ logLevel: config.logLevel, config, services });

  const scheduleHours = Number(
    services.settings.get("schedule.interval_hours") ?? config.syncIntervalHours,
  );
  const scheduler = new Scheduler(services.createSyncRunner(), scheduleHours, {
    info: (m) => app.log.info(m),
    error: (m) => app.log.error(m),
  });
  scheduler.start();

  const shutdown = async (): Promise<void> => {
    scheduler.stop();
    await app.close();
    services.close();
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  try {
    await app.listen({ host: config.bindHost, port: config.port });
    app.log.info(
      `actual-truelayer-manager listening on http://${config.bindHost}:${config.port} ` +
        `(demo mode: ${config.demoMode})`,
    );
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
