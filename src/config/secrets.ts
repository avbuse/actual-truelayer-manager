import { createEncryptor, type Encryptor } from "../crypto/encrypt.js";
import { readEnvOrFile } from "./env.js";

/**
 * Builds an {@link Encryptor} from `APP_ENCRYPTION_KEY` / `APP_ENCRYPTION_KEY_FILE`,
 * or returns `null` when no key is configured.
 */
export function loadEncryptor(
  env: NodeJS.ProcessEnv = process.env,
): Encryptor | null {
  const key = readEnvOrFile("APP_ENCRYPTION_KEY", env);
  if (!key) {
    return null;
  }
  return createEncryptor(key);
}

/**
 * Returns an {@link Encryptor}, or throws if no encryption key is configured.
 *
 * The app must never persist tokens or other secrets in plaintext, so any code
 * path that needs to store sensitive values must go through this (spec §16.6).
 */
export function requireEncryptor(
  env: NodeJS.ProcessEnv = process.env,
): Encryptor {
  const encryptor = loadEncryptor(env);
  if (!encryptor) {
    throw new Error(
      "APP_ENCRYPTION_KEY (or APP_ENCRYPTION_KEY_FILE) is required to store secrets. " +
        "Refusing to continue without encryption.",
    );
  }
  return encryptor;
}
