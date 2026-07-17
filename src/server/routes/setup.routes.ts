import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Services } from "../../services.js";
import { finaliseConnection } from "../connectionFlow.js";
import { parseRedirectUrl } from "../../providers/truelayer/auth.js";
import { bodyStr, readFlash, withFlash } from "../flash.js";
import { setupPage, type SetupViewModel } from "../views/setup.js";
import { connectPage } from "../views/connect.js";

function buildSetupModel(services: Services): Omit<SetupViewModel, "flash"> {
  const actualConfig = services.actualRepo.get();
  const clientId = services.settings.get("truelayer.client_id");
  return {
    demoMode: services.config.demoMode,
    actual: {
      configured: Boolean(actualConfig),
      serverUrl: actualConfig?.server_url,
      syncId: actualConfig?.sync_id,
    },
    truelayer: {
      configured: Boolean(clientId),
      clientId,
      redirectMode:
        services.settings.get("truelayer.redirect_mode") ??
        services.config.truelayer.redirectMode,
    },
    connectionCount: services.connections.list().length,
    mappingCount: services.mappings.list().length,
    scheduleHours: Number(
      services.settings.get("schedule.interval_hours") ??
        services.config.syncIntervalHours,
    ),
  };
}

export async function setupRoutes(
  app: FastifyInstance,
  services: Services,
): Promise<void> {
  app.get("/", async (_request, reply) => reply.redirect("/setup"));

  app.get("/setup", async (request, reply) => {
    const model = buildSetupModel(services);
    return reply
      .type("text/html")
      .send(setupPage({ ...model, flash: readFlash(request.query) }));
  });

  app.post("/setup/actual", async (request, reply) => {
    const serverUrl = bodyStr(request.body, "server_url");
    const syncId = bodyStr(request.body, "sync_id");
    const password = bodyStr(request.body, "password");
    const encryptionPassword = bodyStr(request.body, "encryption_password");

    if (!serverUrl || !syncId) {
      return reply.redirect(
        withFlash("/setup", "error", "Server URL and sync ID are required."),
      );
    }

    const existing = services.actualRepo.get();
    const enc = services.encryptor;
    services.actualRepo.upsert({
      serverUrl,
      syncId,
      passwordEncrypted: password
        ? enc?.encrypt(password) ?? null
        : (existing?.password_encrypted ?? null),
      encryptionPasswordEncrypted: encryptionPassword
        ? enc?.encrypt(encryptionPassword) ?? null
        : (existing?.encryption_password_encrypted ?? null),
    });

    const test = await services.getActualClient().testConnection();
    services.logs.info(`Actual connection test: ${test.message}`);
    return reply.redirect(
      withFlash(
        "/setup",
        test.ok ? "ok" : "error",
        `Actual saved. ${test.message}`,
      ),
    );
  });

  app.post("/setup/truelayer", async (request, reply) => {
    const clientId = bodyStr(request.body, "client_id");
    const clientSecret = bodyStr(request.body, "client_secret");
    const redirectMode = bodyStr(request.body, "redirect_mode") || "manual";

    if (!clientId) {
      return reply.redirect(
        withFlash("/setup", "error", "TrueLayer client ID is required."),
      );
    }
    services.settings.set("truelayer.client_id", clientId);
    services.settings.set("truelayer.redirect_mode", redirectMode);
    if (clientSecret && services.encryptor) {
      services.settings.set(
        "truelayer.client_secret_enc",
        services.encryptor.encrypt(clientSecret),
      );
    }
    services.logs.info("TrueLayer credentials saved");
    return reply.redirect(withFlash("/setup", "ok", "TrueLayer config saved."));
  });

  app.post("/setup/schedule", async (request, reply) => {
    const hours = Number.parseInt(bodyStr(request.body, "interval_hours"), 10);
    const safe = Number.isNaN(hours) || hours < 0 ? 0 : hours;
    services.settings.set("schedule.interval_hours", String(safe));
    return reply.redirect(
      withFlash(
        "/setup",
        "ok",
        safe > 0 ? `Scheduled sync every ${safe}h.` : "Scheduled sync disabled.",
      ),
    );
  });

  app.post("/connections/add", async (request, reply) => {
    const displayName = bodyStr(request.body, "display_name") || "Bank";
    const connectionType =
      bodyStr(request.body, "connection_type") === "credit_card"
        ? "credit_card"
        : "bank_account";

    const connectionId = randomUUID();
    services.connections.create({
      id: connectionId,
      provider: services.provider.name,
      displayName,
      connectionType,
      status: "setup_pending",
    });

    const state = randomUUID();
    services.settings.set(`oauth.state.${state}`, connectionId);

    const redirectMode =
      services.settings.get("truelayer.redirect_mode") ??
      services.config.truelayer.redirectMode;
    const redirectUri =
      redirectMode === "direct"
        ? `${services.config.baseUrl}/oauth/truelayer/callback`
        : "https://console.truelayer.com/redirect-page";

    const authUrl = await services.provider.createAuthUrl({
      state,
      redirectUri,
      connectionType,
    });

    if (services.config.demoMode) {
      const tokens = await services.provider.exchangeAuthCode({
        code: "demo-code",
        redirectUri,
      });
      const count = await finaliseConnection(
        services,
        services.provider,
        connectionId,
        tokens,
      );
      return reply.redirect(
        withFlash(
          "/mappings",
          "ok",
          `Connected "${displayName}" with ${count} accounts. Now map them.`,
        ),
      );
    }

    return reply
      .type("text/html")
      .send(
        connectPage({
          connectionId,
          authUrl,
          redirectMode: redirectMode === "direct" ? "direct" : "manual",
        }),
      );
  });

  app.post("/oauth/exchange", async (request, reply) => {
    const connectionId = bodyStr(request.body, "connection_id");
    const redirectUrl = bodyStr(request.body, "redirect_url");
    try {
      const parsed = parseRedirectUrl(redirectUrl);
      const tokens = await services.provider.exchangeAuthCode({
        code: parsed.code,
        redirectUri: "https://console.truelayer.com/redirect-page",
      });
      const count = await finaliseConnection(
        services,
        services.provider,
        connectionId,
        tokens,
      );
      return reply.redirect(
        withFlash("/mappings", "ok", `Connected with ${count} accounts.`),
      );
    } catch (error) {
      return reply.redirect(
        withFlash(
          "/setup",
          "error",
          error instanceof Error ? error.message : "Failed to exchange code.",
        ),
      );
    }
  });

  app.get("/oauth/truelayer/callback", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const code = query.code;
    const state = query.state;
    if (!code || !state) {
      return reply.redirect(
        withFlash("/setup", "error", "Missing code or state in callback."),
      );
    }
    const connectionId = state
      ? services.settings.get(`oauth.state.${state}`)
      : undefined;
    if (!connectionId) {
      return reply.redirect(
        withFlash("/setup", "error", "Unknown OAuth state."),
      );
    }
    try {
      const tokens = await services.provider.exchangeAuthCode({
        code,
        redirectUri: `${services.config.baseUrl}/oauth/truelayer/callback`,
      });
      const count = await finaliseConnection(
        services,
        services.provider,
        connectionId,
        tokens,
      );
      return reply.redirect(
        withFlash("/mappings", "ok", `Connected with ${count} accounts.`),
      );
    } catch (error) {
      return reply.redirect(
        withFlash(
          "/setup",
          "error",
          error instanceof Error ? error.message : "Callback failed.",
        ),
      );
    }
  });
}
