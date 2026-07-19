import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Smoke check for the adm-zip override used to clear GHSA-xcpc-8h2w-3j85.
 * Live sync lazily imports `@actual-app/api`; this proves the optional package
 * still resolves with the overridden transitive dependency.
 */
describe("@actual-app/api import smoke", () => {
  it("imports the live Actual API surface used by RealActualClient", async () => {
    let api: Record<string, unknown>;
    try {
      api = (await import("@actual-app/api")) as unknown as Record<
        string,
        unknown
      >;
    } catch (error) {
      // Optional dependency may be absent on platforms where it fails to build.
      expect(String(error)).toMatch(/Cannot find module|ERR_MODULE_NOT_FOUND/);
      return;
    }

    expect(typeof api.init).toBe("function");
    expect(typeof api.downloadBudget).toBe("function");
    expect(typeof api.getAccounts).toBe("function");
    expect(typeof api.importTransactions).toBe("function");
    expect(typeof api.shutdown).toBe("function");
  });

  it("resolves adm-zip to a patched version when the Actual chain is present", () => {
    const require = createRequire(import.meta.url);
    let admZipPath: string;
    try {
      admZipPath = require.resolve("adm-zip");
    } catch {
      return;
    }

    const pkg = JSON.parse(
      readFileSync(join(dirname(admZipPath), "package.json"), "utf8"),
    ) as { version: string };
    const [major, minor] = pkg.version.split(".").map(Number);
    expect(major).toBeGreaterThanOrEqual(0);
    expect(minor).toBeGreaterThanOrEqual(6);
  });
});
