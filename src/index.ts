import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ logLevel: config.logLevel });

  try {
    await app.listen({ host: config.bindHost, port: config.port });
    app.log.info(
      `actual-truelayer-manager listening on http://${config.bindHost}:${config.port}`,
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
