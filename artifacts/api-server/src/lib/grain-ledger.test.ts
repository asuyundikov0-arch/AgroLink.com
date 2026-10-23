import assert from "node:assert/strict";
import test from "node:test";
import { calculateGrainLedger, grainBusinessDate, grainNameKey, toGrainKg, validGrainDate, type GrainLedgerRow } from "./grain-ledger";

const row = (id: number, operation: string, kg: number, from: number | null, to: number | null, rest: Partial<GrainLedgerRow> = {}): GrainLedgerRow => ({
  id, unit: "АПК Арыстан Grain", cropId: 1, occurredOn: "2026-10-23", operation,
  quantityKg: kg, fromLocationId: from, toLocationId: to, voidedAt: null, ...rest,
});
test("field arrival creates inventory at exactly the chosen location", () => {
  const result = calculateGrainLedger([row(1, "receipt", 10000, null, 1)]);
  assert.equal(result.summary.totalKg, 10000);
  assert.deepEqual(result.balances.map((b) => [b.locationId, b.quantityKg]), [[1, 10000]]);
  assert.equal(result.issue, null);
});
test("yard to warehouse and warehouse to elevator retain total ownership", () => {
  const result = calculateGrainLedger([row(1, "receipt", 10000, null, 1), row(2, "transfer", 7000, 1, 2), row(3, "transfer", 4000, 2, 3)]);
  assert.equal(result.summary.totalKg, 10000);
  assert.deepEqual(result.balances.map((b) => b.quantityKg), [3000, 3000, 4000]);
  assert.equal(result.summary.transferredKg, 11000);
});
test("sale from elevator reduces overall balance rather than transferring ownership internally", () => {
  const result = calculateGrainLedger([row(1, "opening", 10000, null, 3), row(2, "sale", 2500, 3, null)]);
  assert.equal(result.summary.totalKg, 7500);
  assert.equal(result.summary.soldKg, 2500);
  assert.equal(result.balances[0].quantityKg, 7500);
});
test("outgoing movement cannot borrow another crop's stock", () => {
  assert.ok(calculateGrainLedger([row(1, "receipt", 10000, null, 1), row(2, "sale", 1000, 1, null, { cropId: 2 })]).issue);
});
test("outgoing movement cannot borrow another location or farm's stock", () => {
  assert.ok(calculateGrainLedger([row(1, "opening", 10000, null, 1), row(2, "sale", 1000, 2, null)]).issue);
  assert.ok(calculateGrainLedger([row(1, "opening", 10000, null, 1), row(2, "sale", 1000, 1, null, { unit: "АФ Веденовка" })]).issue);
});
test("backdated sale fails even if final current balance would be positive", () => {
  const result = calculateGrainLedger([row(1, "receipt", 10000, null, 1), row(2, "sale", 1000, 1, null, { occurredOn: "2026-10-22" })]);
  assert.equal(result.summary.totalKg, 9000);
  assert.equal(result.issue?.occurredOn, "2026-10-22");
});
test("cancelling a receipt cannot silently invalidate dependent transfers", () => {
  assert.ok(calculateGrainLedger([row(1, "receipt", 10000, null, 1, { voidedAt: new Date() }), row(2, "transfer", 5000, 1, 2)]).issue);
});
test("cancelled sales and transfers have no impact on stock or totals", () => {
  const result = calculateGrainLedger([row(1, "receipt", 10000, null, 1), row(2, "transfer", 5000, 1, 2, { voidedAt: "2026-10-24T00:00:00Z" }), row(3, "sale", 1000, 1, null, { voidedAt: new Date() })]);
  assert.equal(result.summary.totalKg, 10000);
  assert.equal(result.summary.soldKg, 0);
  assert.equal(result.summary.transferredKg, 0);
});
test("unapproved grain entries do not change inventory until accepted", () => {
  const result = calculateGrainLedger([
    row(1, "receipt", 10000, null, 1),
    row(2, "sale", 4000, 1, null, { approvalStatus: "pending" }),
    row(3, "transfer", 2000, 1, 2, { approvalStatus: "returned" }),
  ]);
  assert.equal(result.summary.totalKg, 10000);
  assert.deepEqual(result.balances.map((balance) => [balance.locationId, balance.quantityKg]), [[1, 10000]]);
  assert.equal(result.summary.soldKg, 0);
  assert.equal(result.issue, null);
});
test("integer kg accounting leaves exact zero after full sale", () => {
  const result = calculateGrainLedger([row(1, "receipt", toGrainKg(0.1)!, null, 1), row(2, "receipt", toGrainKg(0.2)!, null, 1), row(3, "sale", toGrainKg(0.3)!, 1, null)]);
  assert.equal(result.summary.totalKg, 0);
  assert.equal(result.balances[0].quantityKg, 0);
  assert.equal(result.issue, null);
});
test("tonnes conversion validates kilogram precision and upper/lower bounds", () => {
  assert.equal(toGrainKg(0.001), 1);
  assert.equal(toGrainKg(1.234), 1234);
  assert.equal(toGrainKg(1000000), 1000000000);
  for (const invalid of [0, -1, NaN, Infinity, 0.0001, 1.2345, 1000000.001]) assert.equal(toGrainKg(invalid), null);
});
test("calendar validation and Almaty midnight match the accounting day", () => {
  assert.equal(validGrainDate("2026-02-30"), false);
  assert.equal(validGrainDate("2024-02-29"), true);
  assert.equal(grainBusinessDate(new Date("2026-10-22T19:01:00Z")), "2026-10-23");
});
test("reference names normalize spacing, case, and е/ё without merging distinct products", () => {
  assert.equal(grainNameKey("  ЛЁН  "), grainNameKey("лен"));
  assert.notEqual(grainNameKey("Рапс"), grainNameKey("Пшеница"));
});
test("event ordering uses calendar day and stable id, never client array order", () => {
  const ordered = [row(1, "receipt", 10000, null, 1), row(2, "transfer", 5000, 1, 2), row(3, "sale", 2000, 2, null)];
  assert.deepEqual(calculateGrainLedger([...ordered].reverse()), calculateGrainLedger(ordered));
});
test("sum of balances equals opening plus arrivals less sales across all crops and locations", () => {
  const result = calculateGrainLedger([
    row(1, "opening", 5000, null, 1), row(2, "receipt", 12000, null, 2),
    row(3, "transfer", 2000, 1, 3), row(4, "sale", 3000, 2, null),
    row(5, "receipt", 7000, null, 1, { cropId: 2 }), row(6, "sale", 1000, 1, null, { cropId: 2 }),
  ]);
  assert.equal(result.summary.totalKg, 20000);
  assert.equal(result.balances.reduce((total, balance) => total + balance.quantityKg, 0), result.summary.totalKg);
  assert.equal(result.issue, null);
});
