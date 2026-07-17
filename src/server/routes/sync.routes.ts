import type { FastifyInstance } from "fastify";
import type { Services } from "../../services.js";
import { bodyStr, withFlash } from "../flash.js";

export async function syncRoutes(
  app: FastifyInstance,
  services: Services,
): Promise<void> {
  app.post("/sync-now", async (request, reply) => {
    const mode = bodyStr(request.body, "mode") === "dry_run" ? "dry_run" : "live";
    const runner = services.createSyncRunner();
    const summary = await runner.run({
      dryRun: mode === "dry_run",
      mode: mode === "dry_run" ? "dry_run" : "manual",
    });

    services.logs.info(
      `${mode} sync ${summary.runId}: ${summary.status} ` +
        `(fetched ${summary.fetched}, imported ${summary.imported}, duplicates ${summary.duplicate}, failed ${summary.failed})`,
    );

    const label = mode === "dry_run" ? "Dry-run" : "Live sync";
    return reply.redirect(
      withFlash(
        "/dashboard",
        summary.status === "failed" ? "error" : "ok",
        `${label} complete: fetched ${summary.fetched}, ${mode === "dry_run" ? "would import" : "imported"} ${mode === "dry_run" ? summary.fetched - summary.duplicate : summary.imported}, duplicates ${summary.duplicate}.`,
      ),
    );
  });

  app.get("/sync-runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = services.syncRuns.get(id);
    if (!run) {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.send(run);
  });
}
