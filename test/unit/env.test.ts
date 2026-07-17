import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, readEnvOrFile } from "../../src/config/env.js";

describe("readEnvOrFile", () => {
  it("returns the direct value when only the variable is set", () => {
    expect(readEnvOrFile("FOO", { FOO: "bar" })).toBe("bar");
  });

  it("reads from the _FILE path when provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "atm-env-"));
    const file = join(dir, "secret");
    writeFileSync(file, "s3cr3t\n");
    expect(readEnvOrFile("FOO", { FOO_FILE: file })).toBe("s3cr3t");
  });

  it("throws when both the variable and its _FILE are set", () => {
    expect(() =>
      readEnvOrFile("FOO", { FOO: "bar", FOO_FILE: "/tmp/x" }),
    ).toThrow(/only one/);
  });

  it("treats an empty string as unset", () => {
    expect(readEnvOrFile("FOO", { FOO: "" })).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("applies documented defaults", () => {
    const config = loadConfig({});
    expect(config.bindHost).toBe("127.0.0.1");
    expect(config.port).toBe(3020);
    expect(config.baseUrl).toBe("http://localhost:3020");
    expect(config.syncOverlapDays).toBe(3);
    expect(config.syncIntervalHours).toBe(0);
  });

  it("honours overrides", () => {
    const config = loadConfig({ APP_PORT: "4000", APP_BIND_HOST: "0.0.0.0" });
    expect(config.port).toBe(4000);
    expect(config.bindHost).toBe("0.0.0.0");
    expect(config.baseUrl).toBe("http://localhost:4000");
  });

  it("throws on a non-numeric port", () => {
    expect(() => loadConfig({ APP_PORT: "not-a-number" })).toThrow(/integer/);
  });
});
