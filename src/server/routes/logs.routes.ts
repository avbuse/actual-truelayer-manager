import type { FastifyInstance } from "fastify";
import type { Services } from "../../services.js";
import { logsPage } from "../views/logs.js";

export async function logsRoutes(
  app: FastifyInstance,
  services: Services,
): Promise<void> {
  app.get("/logs", async (_request, reply) => {
    return reply.type("text/html").send(logsPage(services.logs.recent()));
  });

  app.get("/logs.json", async () => {
    return services.logs.recent();
  });
}
