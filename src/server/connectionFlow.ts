import { randomUUID } from "node:crypto";
import type { BankingProvider, TokenSet } from "../providers/bankingProvider.js";
import type { ConnectionType } from "../db/types.js";
import type { Services } from "../services.js";

function inferConnectionType(
  accountTypes: string[],
): ConnectionType {
  const hasCard = accountTypes.includes("credit_card");
  const hasBank = accountTypes.some((t) => t !== "credit_card");
  if (hasCard && hasBank) return "mixed";
  if (hasCard) return "credit_card";
  if (hasBank) return "bank_account";
  return "unknown";
}

/**
 * Finalises a bank connection after tokens are obtained: persists the encrypted
 * tokens, discovers accounts, stores them, updates the connection type/status,
 * and returns the number of accounts discovered.
 */
export async function finaliseConnection(
  services: Services,
  provider: BankingProvider,
  connectionId: string,
  tokens: TokenSet,
): Promise<number> {
  services.connections.saveTokens(connectionId, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
    tokenType: tokens.tokenType,
  });

  const accounts = await provider.listAccounts({ tokens });

  let consentExpiresAt: string | undefined;
  if (provider.getConsentExpiry) {
    try {
      consentExpiresAt = await provider.getConsentExpiry({ tokens });
    } catch {
      consentExpiresAt = undefined;
    }
  }
  if (consentExpiresAt) {
    services.connections.setConsentExpiry(connectionId, consentExpiresAt);
  }

  for (const account of accounts) {
    services.connections.upsertProviderAccount({
      id: randomUUID(),
      connectionId,
      provider: provider.name,
      providerAccountId: account.providerAccountId,
      displayName: account.displayName,
      accountType: account.accountType,
      currency: account.currency,
      metadata: {
        sortCode: account.sortCode,
        accountNumberLast4: account.accountNumberLast4,
        balanceMinor: account.balanceMinor,
      },
    });
  }

  const connectionType = inferConnectionType(
    accounts.map((a) => a.accountType),
  );
  services.connections.setStatus(connectionId, "active");
  services.db
    .prepare("UPDATE bank_connections SET connection_type = ? WHERE id = ?")
    .run(connectionType, connectionId);

  services.logs.info(
    `Connection ${connectionId} activated with ${accounts.length} accounts`,
  );
  return accounts.length;
}
