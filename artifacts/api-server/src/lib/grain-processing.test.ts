import assert from "node:assert/strict";
import test from "node:test";
import type { GrainMovementInput } from "@workspace/api-zod";
import { calculateGrainLedger, type GrainLedgerRow } from "./grain-ledger";
import { processingWeights } from "./grain-processing";

const input = (rest: Partial<GrainMovementInput> = {}): GrainMovementInput => ({
  requestId: "grain-processing-test-request", unit: "АПК Арыстан Grain", operation: "drying",
  cropId: 1, occurredOn: "2026-10-23", quantityTons: 100, fromLocationId: 2, toLocationId: 3,
  outputTons: 96, deadWasteTons: 1, grainWasteTons: 2, wasteToLocationId: 3,
  fieldName: "", counterparty: "", notes: "", ...rest,
});
const row = (id: number, rest: Partial<GrainLedgerRow>): GrainLedgerRow => ({
  id, unit: "АПК Арыстан Grain", cropId: 1, occurredOn: "2026-10-23", operation: "opening",
  quantityKg: 100000, fromLocationId: null, toLocationId: 1, voidedAt: null, ...rest,
});
const chain = () => [
  row(1, {}),
  row(2, { operation: "transfer", fromLocationId: 1, toLocationId: 2 }),
  row(3, { operation: "drying", fromLocationId: 2, toLocationId: 3, outputKg: 96000, deadWasteKg: 1000, grainWasteKg: 2000, moistureLossKg: 1000, wasteToLocationId: 3 }),
];
test("drying residual is moisture, separate from both waste types", () => {
  assert.deepEqual(processingWeights(input()), { outputKg: 96000, deadWasteKg: 1000, grainWasteKg: 2000, moistureLossKg: 1000 });
});
test("cleaning requires full weight decomposition, never silently calls missing grain moisture", () => {
  assert.ok(processingWeights(input({ operation: "cleaning" })).error);
  assert.equal(processingWeights(input({ operation: "cleaning", outputTons: 97 })).moistureLossKg, 0);
});
test("all process weights preserve kg precision including valid zero output", () => {
  for (const bad of [-1, NaN, Infinity, 0.0001, 1000000.001]) {
    for (const field of ["outputTons", "deadWasteTons", "grainWasteTons"]) assert.ok(processingWeights(input({ [field]: bad })).error);
  }
  assert.equal(processingWeights(input({ outputTons: 0, deadWasteTons: 100, grainWasteTons: 0, wasteToLocationId: null })).moistureLossKg, 0);
  assert.ok(processingWeights(input({ outputTons: 100 })).error);
});
test("processing requires matching waste destination and grain input material", () => {
  assert.ok(processingWeights(input({ wasteToLocationId: null })).error);
  assert.ok(processingWeights(input({ grainWasteTons: 0 })).error);
  assert.ok(processingWeights(input({ stockKind: "grain_waste" })).error);
  assert.ok(processingWeights(input({ toLocationId: 2 })).error);
  assert.ok(processingWeights(input({ fromLocationId: null })).error);
});
test("ordinary movements cannot hide waste fields or treat field arrivals as waste", () => {
  assert.ok(processingWeights(input({ operation: "transfer" })).error);
  assert.ok(processingWeights(input({ operation: "receipt", stockKind: "grain_waste", outputTons: 0, deadWasteTons: 0, grainWasteTons: 0, wasteToLocationId: null })).error);
  assert.equal(processingWeights(input({ operation: "sale", stockKind: "grain_waste", outputTons: 0, deadWasteTons: 0, grainWasteTons: 0, wasteToLocationId: null })).outputKg, 0);
});
test("sending to processor preserves ownership; completion splits material without double counting", () => {
  assert.equal(calculateGrainLedger(chain().slice(0, 2)).summary.totalKg, 100000);
  const result = calculateGrainLedger(chain());
  assert.equal(result.issue, null);
  assert.equal(result.summary.totalKg, 96000);
  assert.equal(result.summary.grainWasteKg, 2000);
  assert.equal(result.summary.deadWasteKg, 1000);
  assert.equal(result.summary.moistureLossKg, 1000);
  assert.equal(result.summary.processedKg, 100000);
  assert.equal(result.balances.reduce((s, b) => s + b.quantityKg, 0) + result.summary.deadWasteKg + result.summary.moistureLossKg, 100000);
  assert.equal(result.balances.find((b) => b.stockKind === "grain_waste")?.locationId, 3);
});
test("partial completion leaves unfinished grain in processor instead of treating it as loss", () => {
  const rows = chain();
  rows[2] = { ...rows[2], quantityKg: 40000, outputKg: 38000, deadWasteKg: 500, grainWasteKg: 1000, moistureLossKg: 500 };
  const result = calculateGrainLedger(rows);
  assert.equal(result.issue, null);
  assert.equal(result.balances.find((b) => b.locationId === 2)?.quantityKg, 60000);
  assert.equal(result.summary.totalKg, 98000);
  assert.equal(result.summary.grainWasteKg, 1000);
});
test("grain waste transfers and sales do not consume grain or inflate grain KPIs", () => {
  const result = calculateGrainLedger([...chain(),
    row(4, { operation: "transfer", quantityKg: 1000, fromLocationId: 3, toLocationId: 4, stockKind: "grain_waste" }),
    row(5, { operation: "sale", quantityKg: 500, fromLocationId: 4, toLocationId: null, stockKind: "grain_waste" }),
  ]);
  assert.equal(result.issue, null);
  assert.equal(result.summary.totalKg, 96000);
  assert.equal(result.summary.grainWasteKg, 1500);
  assert.equal(result.summary.soldKg, 0);
  assert.equal(result.summary.transferredKg, 100000);
});
test("grain cannot cover a shortfall of grain waste in same warehouse and crop", () => {
  const result = calculateGrainLedger([...chain(), row(4, { operation: "sale", quantityKg: 2001, stockKind: "grain_waste", fromLocationId: 3, toLocationId: null })]);
  assert.equal(result.issue?.shortageKg, 1);
  assert.equal(result.issue?.stockKind, "grain_waste");
});
test("cancel completion restores input and removes outputs/losses unless outputs already used", () => {
  const rows = chain();
  const cancelled = { ...rows[2], voidedAt: new Date() };
  const result = calculateGrainLedger([rows[0], rows[1], cancelled]);
  assert.equal(result.issue, null);
  assert.equal(result.summary.totalKg, 100000);
  assert.equal(result.summary.grainWasteKg, 0);
  assert.equal(result.summary.deadWasteKg, 0);
  assert.equal(result.summary.moistureLossKg, 0);
  assert.ok(calculateGrainLedger([rows[0], rows[1], cancelled, row(4, { operation: "sale", quantityKg: 1, stockKind: "grain_waste", fromLocationId: 3, toLocationId: null })]).issue);
});
test("backdated processing cannot use grain sent to processor later", () => {
  const rows = chain();
  rows[2] = { ...rows[2], occurredOn: "2026-10-22" };
  assert.equal(calculateGrainLedger(rows).issue?.locationId, 2);
});
test("drying then cleaning preserves exact conservation across two installations", () => {
  const result = calculateGrainLedger([...chain(),
    row(4, { operation: "transfer", quantityKg: 96000, fromLocationId: 3, toLocationId: 4 }),
    row(5, { operation: "cleaning", quantityKg: 96000, fromLocationId: 4, toLocationId: 3, outputKg: 94000, deadWasteKg: 500, grainWasteKg: 1500, moistureLossKg: 0, wasteToLocationId: 3 }),
  ]);
  assert.equal(result.issue, null);
  assert.equal(result.summary.totalKg, 94000);
  assert.equal(result.summary.grainWasteKg, 3500);
  assert.equal(result.summary.deadWasteKg, 1500);
  assert.equal(result.summary.moistureLossKg, 1000);
  assert.equal(result.summary.totalKg + result.summary.grainWasteKg + result.summary.deadWasteKg + result.summary.moistureLossKg, 100000);
});
