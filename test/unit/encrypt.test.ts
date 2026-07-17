import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createEncryptor,
  deriveKey,
  EncryptionError,
} from "../../src/crypto/encrypt.js";

const base64Key = randomBytes(32).toString("base64");
const rawKey = "this-is-a-32-byte-long-raw-secret!!";

describe("deriveKey", () => {
  it("accepts a base64 32-byte key", () => {
    expect(deriveKey(base64Key)).toHaveLength(32);
  });

  it("accepts a raw string key of at least 32 bytes", () => {
    expect(deriveKey(rawKey)).toHaveLength(32);
  });

  it("rejects keys shorter than 32 bytes", () => {
    expect(() => deriveKey("too-short")).toThrow(EncryptionError);
  });
});

describe("createEncryptor", () => {
  it("round-trips a plaintext value", () => {
    const enc = createEncryptor(base64Key);
    const secret = "super-secret-refresh-token";
    const encrypted = enc.encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(enc.decrypt(encrypted)).toBe(secret);
  });

  it("produces the self-describing v1:gcm format with a unique IV", () => {
    const enc = createEncryptor(base64Key);
    const a = enc.encrypt("value");
    const b = enc.encrypt("value");
    expect(a.startsWith("v1:gcm:")).toBe(true);
    expect(a.split(":")).toHaveLength(5);
    // Fresh IV per call => identical plaintext yields different ciphertext.
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", () => {
    const enc = createEncryptor(base64Key);
    const other = createEncryptor(randomBytes(32).toString("base64"));
    const encrypted = enc.encrypt("value");
    expect(() => other.decrypt(encrypted)).toThrow(EncryptionError);
  });

  it("fails to decrypt tampered ciphertext (auth tag mismatch)", () => {
    const enc = createEncryptor(base64Key);
    const encrypted = enc.encrypt("value");
    const parts = encrypted.split(":");
    parts[4] = Buffer.from("tampered").toString("base64");
    expect(() => enc.decrypt(parts.join(":"))).toThrow(EncryptionError);
  });

  it("rejects malformed payloads", () => {
    const enc = createEncryptor(base64Key);
    expect(() => enc.decrypt("not-a-valid-payload")).toThrow(EncryptionError);
  });
});
