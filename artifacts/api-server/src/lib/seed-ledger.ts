export class SeedError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function seedCheck(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new SeedError(message, status);
}
export const roundRatio = (a: bigint, b: bigint) => (a + b / 2n) / b;
export type SeedLedgerRow = {
  id: number; unit: string; cropId: number; kind: string; occurredOn: string;
  quantityKg: number; amountCents: string; approvalStatus: string;
};
export function seedBalances(rows: SeedLedgerRow[]) {
  const balances = new Map<string, { unit: string; cropId: number; quantityKg: number; cents: bigint; latestDate: string }>();
  // Same-day requests may be approved out of creation order. Availability and
  // chronology are checked under the grain lock when posting, not by request id.
  for (const row of rows.filter(r => r.approvalStatus === "approved")) {
    const key = `${row.unit}\0${row.cropId}`;
    const stock = balances.get(key) ?? { unit: row.unit, cropId: row.cropId, quantityKg: 0, cents: 0n, latestDate: "" };
    const sign = row.kind === "issue" ? -1 : 1;
    stock.quantityKg += sign * row.quantityKg;
    stock.cents += BigInt(sign) * BigInt(row.amountCents);
    stock.latestDate = stock.latestDate > row.occurredOn ? stock.latestDate : row.occurredOn;
    balances.set(key, stock);
  }
  for (const stock of balances.values()) {
    seedCheck(stock.quantityKg >= 0 && stock.cents >= 0n, "Недостаточно семян на складе.", 409);
    seedCheck(stock.cents <= BigInt(Number.MAX_SAFE_INTEGER), "Превышен допустимый денежный остаток.", 409);
  }
  return balances;
}

export function seedIssueCost(stock: { quantityKg: number; cents: bigint } | undefined, quantityKg: number) {
  seedCheck(stock && stock.quantityKg >= quantityKg && quantityKg > 0, "Недостаточно семян выбранной культуры.", 409);
  return {
    amountCents: roundRatio(stock.cents * BigInt(quantityKg), BigInt(stock.quantityKg)),
    pricePerTonCents: roundRatio(stock.cents * 1000n, BigInt(stock.quantityKg)),
  };
}
