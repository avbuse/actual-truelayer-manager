import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for values stored at rest in SQLite (spec §10).
 *
 * Encrypted values use a self-describing format so the scheme can evolve:
 *
 *   v1:gcm:<base64_iv>:<base64_auth_tag>:<base64_ciphertext>
 *
 * Each value is encrypted with a fresh random 96-bit IV.
 */

const VERSION = "v1";
const MODE = "gcm";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const KEY_LENGTH = 32; // AES-256

export class EncryptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EncryptionError";
  }
}

function looksLikeBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Derives a 32-byte AES key from the provided key material. The value may be
 * supplied either as base64 (decoding to at least 32 bytes) or as a raw string
 * of at least 32 bytes. Values longer than 32 bytes are truncated to 32.
 */
export function deriveKey(rawKey: string): Buffer {
  let bytes: Buffer;
  if (looksLikeBase64(rawKey)) {
    const decoded = Buffer.from(rawKey, "base64");
    bytes = decoded.length >= KEY_LENGTH ? decoded : Buffer.from(rawKey, "utf8");
  } else {
    bytes = Buffer.from(rawKey, "utf8");
  }

  if (bytes.length < KEY_LENGTH) {
    throw new EncryptionError(
      `Encryption key must be at least ${KEY_LENGTH} bytes after decoding (got ${bytes.length}).`,
    );
  }

  return bytes.subarray(0, KEY_LENGTH);
}

export interface Encryptor {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
}

export function createEncryptor(rawKey: string): Encryptor {
  const key = deriveKey(rawKey);

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return [
        VERSION,
        MODE,
        iv.toString("base64"),
        authTag.toString("base64"),
        ciphertext.toString("base64"),
      ].join(":");
    },

    decrypt(payload: string): string {
      const parts = payload.split(":");
      const [version, mode, ivB64, tagB64, dataB64] = parts;

      if (
        parts.length !== 5 ||
        version !== VERSION ||
        mode !== MODE ||
        !ivB64 ||
        !tagB64 ||
        !dataB64
      ) {
        throw new EncryptionError("Unrecognised encrypted value format.");
      }

      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(ivB64, "base64"),
      );
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));

      try {
        return Buffer.concat([
          decipher.update(Buffer.from(dataB64, "base64")),
          decipher.final(),
        ]).toString("utf8");
      } catch (cause) {
        throw new EncryptionError(
          "Failed to decrypt value (wrong key or corrupted data).",
          { cause },
        );
      }
    },
  };
}
