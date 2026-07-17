import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface VersionCompatibility {
  compatible: boolean;
  message: string;
  serverVersion?: string;
  apiVersion?: string;
}

/** Version of the bundled `@actual-app/api`, or undefined when not installed. */
export function getBundledApiVersion(): string | undefined {
  try {
    const pkg = require("@actual-app/api/package.json") as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

/** Queries the Actual server's reported version via its `/info` endpoint. */
export async function fetchActualServerVersion(
  serverUrl: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(new URL("/info", serverUrl));
    if (!res.ok) return undefined;
    const data = (await res.json()) as { build?: { version?: string } };
    return data.build?.version;
  } catch {
    return undefined;
  }
}

function majorMinor(version: string): string | undefined {
  const match = /^v?(\d+)\.(\d+)/.exec(version.trim());
  return match ? `${match[1]}.${match[2]}` : undefined;
}

/**
 * Compares the Actual server version against the bundled `@actual-app/api`
 * version (spec §14.2). Only the major.minor line is compared, since Actual
 * releases the server and API package together.
 */
export function compareActualVersions(
  serverVersion: string | undefined,
  apiVersion: string | undefined,
): VersionCompatibility {
  if (!apiVersion) {
    return {
      compatible: false,
      message:
        "The '@actual-app/api' package is not installed, so live sync is unavailable.",
    };
  }
  if (!serverVersion) {
    return {
      compatible: true,
      message: `Could not determine the Actual server version; using @actual-app/api ${apiVersion}.`,
      apiVersion,
    };
  }

  const server = majorMinor(serverVersion);
  const api = majorMinor(apiVersion);
  if (server && api && server !== api) {
    return {
      compatible: false,
      serverVersion,
      apiVersion,
      message:
        `Actual server version is ${serverVersion} but bundled @actual-app/api is ${apiVersion}. ` +
        "These versions may be incompatible. Use an image built for the server version " +
        "or update the bundled API package.",
    };
  }

  return {
    compatible: true,
    serverVersion,
    apiVersion,
    message: `Actual server ${serverVersion} matches @actual-app/api ${apiVersion}.`,
  };
}

/** Convenience: fetch versions and compare in one call. */
export async function checkActualVersion(
  serverUrl: string,
): Promise<VersionCompatibility> {
  const [serverVersion, apiVersion] = [
    await fetchActualServerVersion(serverUrl),
    getBundledApiVersion(),
  ];
  return compareActualVersions(serverVersion, apiVersion);
}
