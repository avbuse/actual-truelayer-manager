import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";

describe("HTTP app", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("GET /status returns the not-configured shape", async () => {
    const response = await app.inject({ method: "GET", url: "/status" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.actual.status).toBe("not_configured");
    expect(body.connections).toEqual([]);
    expect(body.sync.last_imported_count).toBe(0);
  });

  it("GET /setup renders the wizard HTML", async () => {
    const response = await app.inject({ method: "GET", url: "/setup" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Connect to Actual Budget");
    expect(response.body).toContain("Configure TrueLayer credentials");
  });

  it("GET /dashboard and /logs render", async () => {
    const dash = await app.inject({ method: "GET", url: "/dashboard" });
    expect(dash.statusCode).toBe(200);
    expect(dash.body).toContain("Actual Budget");
    const logs = await app.inject({ method: "GET", url: "/logs" });
    expect(logs.statusCode).toBe(200);
    expect(logs.body).toContain("Recent logs");
  });

  it("GET / redirects to /setup", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/setup");
  });
});
