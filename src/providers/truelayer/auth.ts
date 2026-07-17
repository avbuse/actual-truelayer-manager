export interface ParsedRedirect {
  code: string;
  state?: string;
}

/**
 * Extracts the OAuth `code` (and optional `state`) from a redirect URL that the
 * user pastes back into the UI in manual redirect-page mode (spec §15.2). The
 * `code` may live in either the query string or the fragment.
 */
export function parseRedirectUrl(input: string): ParsedRedirect {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (cause) {
    throw new Error("Pasted value is not a valid URL.", { cause });
  }

  const fromQuery = url.searchParams;
  const fromFragment = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );

  const code = fromQuery.get("code") ?? fromFragment.get("code");
  const state = fromQuery.get("state") ?? fromFragment.get("state") ?? undefined;

  if (!code) {
    throw new Error("No 'code' parameter found in the pasted redirect URL.");
  }

  return { code, state: state ?? undefined };
}
