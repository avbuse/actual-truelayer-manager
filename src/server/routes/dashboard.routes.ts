import type { FastifyInstance } from "fastify";
import type { Services } from "../../services.js";
import { readFlash } from "../flash.js";
import { dashboardPage } from "../views/dashboard.js";

export async function dashboardRoutes(
  app: FastifyInstance,
  services: Services,
): Promise<void> {
  app.get("/dashboard", async (request, reply) => {
    const actualConfig = services.actualRepo.get();
    const mappings = services.mappings.list();
    const mappedByConnection = new Map<string, number>();
    for (const m of mappings) {
      mappedByConnection.set(
        m.connection_id,
        (mappedByConnection.get(m.connection_id) ?? 0) + 1,
      );
    }

    const connections = services.connections.list().map((c) => ({
      ...c,
      mappedAccounts: mappedByConnection.get(c.id) ?? 0,
    }));

    return reply.type("text/html").send(
      dashboardPage({
        demoMode: services.config.demoMode,
        actual: {
          status: actualConfig ? "ok" : "not_configured",
          serverUrl: actualConfig?.server_url,
          syncId: actualConfig?.sync_id,
        },
        connections,
        lastSync: services.syncRuns.latest(),
        scheduleHours: Number(
          services.settings.get("schedule.interval_hours") ??
            services.config.syncIntervalHours,
        ),
        flash: readFlash(request.query),
      }),
    );
  });
}
