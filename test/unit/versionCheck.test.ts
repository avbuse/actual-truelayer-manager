import { describe, expect, it } from "vitest";
import { compareActualVersions } from "../../src/actual/versionCheck.js";

describe("compareActualVersions", () => {
  it("flags a missing api package as incompatible", () => {
    const result = compareActualVersions("25.7.0", undefined);
    expect(result.compatible).toBe(false);
    expect(result.message).toMatch(/not installed/);
  });

  it("is tolerant when the server version is unknown", () => {
    const result = compareActualVersions(undefined, "25.7.0");
    expect(result.compatible).toBe(true);
    expect(result.apiVersion).toBe("25.7.0");
  });

  it("accepts matching major.minor versions", () => {
    const result = compareActualVersions("25.7.1", "25.7.0");
    expect(result.compatible).toBe(true);
  });

  it("warns on mismatched major.minor versions", () => {
    const result = compareActualVersions("25.8.0", "25.7.0");
    expect(result.compatible).toBe(false);
    expect(result.message).toMatch(/may be incompatible/);
  });
});
