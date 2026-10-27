export class ChemicalError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function chemicalCheck(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new ChemicalError(status, message);
}
export function scaledChemical(value: number, scale: number, label: string) {
  const result = Math.round(value * scale);
  chemicalCheck(Number.isFinite(value) && Number.isSafeInteger(result)
    && Math.abs(value * scale - result) < 0.00001, `Проверьте точность: ${label}.`);
  return result;
}
/** Allocate the remaining book value; final withdrawal consumes rounding residue. */
export function chemicalIssueValue(quantity: number, remaining: number, cents: number) {
  chemicalCheck(quantity > 0 && quantity <= remaining, "Недостаточно химии на складе.", 409);
  return quantity === remaining ? cents : roundedRatio(cents, quantity, remaining);
}
function roundedRatio(a: number, b: number, divisor: number) {
  const product = BigInt(a) * BigInt(b);
  const d = BigInt(divisor);
  return Number((product * 2n + d) / (2n * d));
}
export function chemicalReceiptValue(quantityMillis: number, unitPriceCents: number) {
  return roundedRatio(quantityMillis, unitPriceCents, 1000);
}
export function chemicalCostPerHa(cents: number, sownAres: number) {
  return sownAres > 0 ? Math.round(cents * 100 / sownAres) / 100 : null;
}

export function chemicalFieldCosts(
  issues: { id: number; seasonId: number; amountCents: string; chemicalRequestId: number | null }[],
  consumptions: { issueId: number; amountCents: string }[],
) {
  const costs = new Map<number, number>();
  const byId = new Map(issues.map(i => [i.id, i]));
  for (const issue of issues.filter(i => i.chemicalRequestId === null))
    costs.set(issue.seasonId, (costs.get(issue.seasonId) ?? 0) + Number(issue.amountCents));
  for (const consumption of consumptions) {
    const issue = byId.get(consumption.issueId);
    if (issue) costs.set(issue.seasonId, (costs.get(issue.seasonId) ?? 0) + Number(consumption.amountCents));
  }
  return costs;
}
