import { createHash } from "node:crypto";
import type { BankTransaction } from "../providers/bankingProvider.js";
import type { ActualImportTransaction } from "../actual/actualClient.js";

/**
 * Returns a stable identifier for a transaction. Uses the provider transaction
 * ID when present; otherwise derives a deterministic fallback hash from the
 * transaction's identifying fields (spec §13.4).
 */
export function transactionKey(
  provider: string,
  tx: BankTransaction,
): { id: string; fallback: boolean } {
  if (tx.providerTransactionId) {
    return { id: tx.providerTransactionId, fallback: false };
  }
  const hash = createHash("sha256")
    .update(
      [
        provider,
        tx.providerAccountId,
        tx.bookedDate,
        String(tx.amountMinor),
        tx.description,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
  return { id: `fallback-${hash}`, fallback: true };
}

/** Normalises a provider transaction into Actual's import shape. */
export function normaliseTransaction(
  provider: string,
  tx: BankTransaction,
  actualAccountId: string,
): ActualImportTransaction & { fallback: boolean } {
  const key = transactionKey(provider, tx);
  return {
    accountId: actualAccountId,
    date: tx.bookedDate,
    amountMinor: tx.amountMinor,
    payeeName: tx.merchantName ?? tx.description,
    importedId: key.id,
    notes: key.fallback ? "imported (fallback id)" : undefined,
    fallback: key.fallback,
  };
}
