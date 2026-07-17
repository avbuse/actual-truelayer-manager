import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEncryptor, requireEncryptor } from "../../src/config/secrets.js";

const key = randomBytes(32).toString("base64");

describe("loadEncryptor", () => {
  it("returns null when no key is configured", () => {
    expect(loadEncryptor({})).toBeNull();
  });

  it("builds a working encryptor from APP_ENCRYPTION_KEY", () => {
    const enc = loadEncryptor({ APP_ENCRYPTION_KEY: key });
    expect(enc).not.toBeNull();
    const encrypted = enc!.encrypt("secret");
    expect(enc!.decrypt(encrypted)).toBe("secret");
  });

  it("loads the key from APP_ENCRYPTION_KEY_FILE", () => {
    const dir = mkdtempSync(join(tmpdir(), "atm-secrets-"));
    const file = join(dir, "key");
    writeFileSync(file, `${key}\n`);
    const enc = loadEncryptor({ APP_ENCRYPTION_KEY_FILE: file });
    expect(enc).not.toBeNull();
  });
});

describe("requireEncryptor", () => {
  it("throws (refuses plaintext) when no key is configured", () => {
    expect(() => requireEncryptor({})).toThrow(/required to store secrets/);
  });

  it("returns an encryptor when a key is configured", () => {
    expect(requireEncryptor({ APP_ENCRYPTION_KEY: key })).toBeTruthy();
  });
});
