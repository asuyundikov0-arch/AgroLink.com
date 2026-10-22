export type GrainLedgerRow = {
  id: number;
  unit: string;
  cropId: number;
  occurredOn: string;
  operation: string;
  quantityKg: number;
  fromLocationId: number | null;
  toLocationId: number | null;
  voidedAt: Date | string | null;
};
export const grainUnits = ["АПК Арыстан Grain", "АФ Веденовка"] as const;
export const grainNameKey = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru").replace(/ё/g, "е");

export function grainBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validGrainDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2200-12-31") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function toGrainKg(tonnes: number): number | null {
  if (!Number.isFinite(tonnes) || tonnes <= 0 || tonnes > 1000000 || Number(tonnes.toFixed(3)) !== tonnes) return null;
  return Math.round(tonnes * 1000);
}

type GrainLedgerIssue = { locationId: number; cropId: number; occurredOn: string; shortageKg: number };
export function calculateGrainLedger(rows: GrainLedgerRow[]): {
  balances: { unit: string; cropId: number; locationId: number; quantityKg: number }[];
  summary: { openingKg: number; receivedKg: number; soldKg: number; transferredKg: number; totalKg: number };
  issue: GrainLedgerIssue | null;
} {
  const balances = new Map<string, { unit: string; cropId: number; locationId: number; quantityKg: number }>();
  const summary = { openingKg: 0, receivedKg: 0, soldKg: 0, transferredKg: 0, totalKg: 0 };
  let issue: GrainLedgerIssue | null = null;
  const active = rows.filter((row) => !row.voidedAt).sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id - b.id);
  const change = (row: GrainLedgerRow, locationId: number, delta: number) => {
    const key = `${row.unit}\0${row.cropId}\0${locationId}`;
    const balance = balances.get(key) ?? { unit: row.unit, cropId: row.cropId, locationId, quantityKg: 0 };
    balance.quantityKg += delta;
    balances.set(key, balance);
    if (balance.quantityKg < 0 && !issue) issue = { locationId, cropId: row.cropId, occurredOn: row.occurredOn, shortageKg: -balance.quantityKg };
  };
  for (const row of active) {
    if (row.fromLocationId !== null) change(row, row.fromLocationId, -row.quantityKg);
    if (row.toLocationId !== null) change(row, row.toLocationId, row.quantityKg);
    if (row.operation === "opening") summary.openingKg += row.quantityKg;
    if (row.operation === "receipt") summary.receivedKg += row.quantityKg;
    if (row.operation === "sale") summary.soldKg += row.quantityKg;
    if (row.operation === "transfer") summary.transferredKg += row.quantityKg;
  }
  summary.totalKg = summary.openingKg + summary.receivedKg - summary.soldKg;
  return { balances: [...balances.values()], summary, issue };
}
