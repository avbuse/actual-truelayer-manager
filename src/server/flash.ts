export interface Flash {
  kind: "ok" | "error";
  message: string;
}

/** Reads a flash message from PRG-style query params (`?kind=ok&msg=...`). */
export function readFlash(query: unknown): Flash | undefined {
  if (!query || typeof query !== "object") return undefined;
  const q = query as Record<string, unknown>;
  const message = typeof q.msg === "string" ? q.msg : undefined;
  if (!message) return undefined;
  const kind = q.kind === "error" ? "error" : "ok";
  return { kind, message };
}

/** Builds a redirect target with an attached flash message. */
export function withFlash(
  path: string,
  kind: "ok" | "error",
  message: string,
): string {
  const params = new URLSearchParams({ kind, msg: message });
  return `${path}?${params.toString()}`;
}

export function bodyStr(body: unknown, key: string): string {
  if (body && typeof body === "object") {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string") return value.trim();
  }
  return "";
}
