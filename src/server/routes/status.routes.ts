import type { FastifyInstance } from "fastify";
import type { Services } from "../../services.js";

export async function statusRoutes(
  app: FastifyInstance,
  services: Services,
): Promise<void> {
  app.get("/status", async () => {
    const actualConfig = services.actualRepo.get();
    const connections = services.connections.list();
    const mappings = services.mappings.list();
    const last = services.syncRuns.latest();

    const mappedByConnection = new Map<string, number>();
    for (const m of mappings) {
      mappedByConnection.set(
        m.connection_id,
        (mappedByConnection.get(m.connection_id) ?? 0) + 1,
      );
    }

    return {
      actual: {
        status: actualConfig ? "ok" : "not_configured",
        server_url: actualConfig?.server_url ?? null,
      },
      connections: connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        display_name: c.display_name,
        status: c.status,
        consent_expires_at: c.consent_expires_at,
        mapped_accounts: mappedByConnection.get(c.id) ?? 0,
      })),
      sync: {
        last_sync_at: last?.finished_at ?? null,
        last_result: last?.status ?? null,
        last_imported_count: last?.imported_count ?? 0,
        next_sync_at: null,
      },
    };
  });
}
