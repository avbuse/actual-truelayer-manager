import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ActualAccount } from "../../actual/actualClient.js";
import type { Services } from "../../services.js";
import { bodyStr, readFlash, withFlash } from "../flash.js";
import { mappingsPage } from "../views/mappings.js";

export async function mappingsRoutes(
  app: FastifyInstance,
  services: Services,
): Promise<void> {
  app.get("/mappings", async (request, reply) => {
    let actualAccounts: ActualAccount[] = [];
    try {
      actualAccounts = await services.getActualClient().listAccounts();
    } catch {
      actualAccounts = [];
    }

    return reply.type("text/html").send(
      mappingsPage({
        providerAccounts: services.connections.listProviderAccounts(),
        actualAccounts,
        mappings: services.mappings.list(),
        flash: readFlash(request.query),
      }),
    );
  });

  app.post("/mappings", async (request, reply) => {
    const connectionId = bodyStr(request.body, "connection_id");
    const providerAccountId = bodyStr(request.body, "provider_account_id");
    const actualAccountId = bodyStr(request.body, "actual_account_id");

    if (!connectionId || !providerAccountId || !actualAccountId) {
      return reply.redirect(
        withFlash("/mappings", "error", "Missing mapping fields."),
      );
    }

    let actualName = actualAccountId;
    try {
      const accounts = await services.getActualClient().listAccounts();
      actualName =
        accounts.find((a) => a.id === actualAccountId)?.name ?? actualAccountId;
    } catch {
      // keep id as name fallback
    }

    services.mappings.upsert({
      id: randomUUID(),
      connectionId,
      providerAccountId,
      actualAccountId,
      actualAccountName: actualName,
      enabled: true,
    });
    services.logs.info(
      `Mapped ${providerAccountId} -> ${actualName}`,
    );
    return reply.redirect(withFlash("/mappings", "ok", "Mapping saved."));
  });
}
