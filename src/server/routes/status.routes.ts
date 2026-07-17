import type { FastifyInstance } from "fastify";

/**
 * Reports a high-level status document. In Phase 0 there are no configured
 * connections yet, so this returns the "not configured" shape described in the
 * spec (section 12.2) without touching any persistent state.
 */
export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/status", async () => {
    return {
      actual: {
        status: "not_configured",
        server_url: null,
      },
      connections: [],
      sync: {
        last_sync_at: null,
        last_result: null,
        last_imported_count: 0,
        next_sync_at: null,
      },
    };
  });
}
