/**
 * Redaction utilities (spec §16.1). Used to keep secrets out of logs, error
 * messages, and any status/log output. Redaction is best-effort defence in
 * depth: the primary rule is still "do not log secrets in the first place".
 */

export const REDACTED = "***";

/** Keys redacted in `key=value` form (query strings, callback URLs, env dumps). */
const KV_KEYS = [
  "access_token",
  "refresh_token",
  "client_secret",
  "code",
  "password",
  "encryption_password",
];

/** Keys redacted in JSON `"key":"value"` form. */
const JSON_KEYS = [
  "access_token",
  "refresh_token",
  "client_secret",
  "password",
  "encryption_password",
  "token",
];

const KV_PATTERN = new RegExp(`\\b(${KV_KEYS.join("|")})=([^&\\s"']+)`, "gi");
const JSON_PATTERN = new RegExp(
  `("(?:${JSON_KEYS.join("|")})"\\s*:\\s*")[^"]*(")`,
  "gi",
);
const BEARER_PATTERN = /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

/** Object keys whose string values are always redacted (case-insensitive). */
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|encryption_key|_key$)/i;

/**
 * Redacts sensitive substrings from a string: OAuth `code`/`token` query
 * params, JSON secret fields, and `Authorization: Bearer` headers. Any provided
 * `knownSecrets` literals are also masked wherever they appear.
 */
export function redactString(input: string, knownSecrets: string[] = []): string {
  let output = input
    .replace(KV_PATTERN, (_match, key: string) => `${key}=${REDACTED}`)
    .replace(
      JSON_PATTERN,
      (_match, prefix: string, suffix: string) =>
        `${prefix}${REDACTED}${suffix}`,
    )
    .replace(BEARER_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED}`);

  for (const secret of knownSecrets) {
    if (secret && secret.length >= 4) {
      output = output.split(secret).join(REDACTED);
    }
  }

  return output;
}

/**
 * Deep-clones a value, redacting string values under sensitive keys and
 * scrubbing sensitive substrings from all remaining strings.
 */
export function redactValue<T>(value: T, knownSecrets: string[] = []): T {
  if (typeof value === "string") {
    return redactString(value, knownSecrets) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, knownSecrets)) as T;
  }

  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key) && typeof item === "string") {
        output[key] = REDACTED;
      } else {
        output[key] = redactValue(item, knownSecrets);
      }
    }
    return output as T;
  }

  return value;
}
