import type { FastifyInstance } from "fastify";
import { setupPage } from "../views/setup.js";

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (_request, reply) => {
    return reply.redirect("/setup");
  });

  app.get("/setup", async (_request, reply) => {
    return reply.type("text/html").send(setupPage());
  });
}
