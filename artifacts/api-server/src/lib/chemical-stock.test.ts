import assert from "node:assert/strict";
import { test } from "node:test";
import { CreateChemicalInvoiceBody, CreateChemicalIssueBody, GetChemicalWarehouseResponse } from "@workspace/api-zod";
import { chemicalIssueValue, chemicalReceiptValue, chemicalCostPerHa, scaledChemical } from "./chemical-stock";

test("partial issues retain stock cost; final issue consumes remaining rounding", () => {
  assert.equal(chemicalReceiptValue(100_000, 150_000), 15_000_000);
  assert.equal(chemicalIssueValue(20_000, 100_000, 15_000_000), 3_000_000);
  assert.equal(chemicalCostPerHa(3_000_000, 5_000), 600);
  assert.equal(chemicalCostPerHa(3_000_000, 0), null);
  let cents = 100;
  let quantity = 3000;
  const allocations = [];
  while (quantity) {
    const value = chemicalIssueValue(1000, quantity, cents);
    allocations.push(value);
    cents -= value;
    quantity -= 1000;
  }
  assert.deepEqual(allocations, [33, 34, 33]);
  assert.equal(cents, 0);
  assert.throws(() => chemicalIssueValue(1001, 1000, 100), /Недостаточно/);
  assert.throws(() => chemicalIssueValue(0, 1000, 100));
});

test("decimal precision is explicit; large integer allocation is exact", () => {
  assert.equal(scaledChemical(1.123, 1000, "количество"), 1123);
  assert.equal(scaledChemical(0.29, 100, "цена"), 29);
  assert.throws(() => scaledChemical(0.0001, 1000, "количество"));
  assert.throws(() => scaledChemical(10.001, 100, "цена"));
  assert.throws(() => scaledChemical(NaN, 1000, "количество"));
  assert.equal(chemicalReceiptValue(999_999_999, 999_999_999), 999_999_998_000_000);
  assert.equal(chemicalIssueValue(999_999_999, 1_000_000_000, 1_000_000_000_000), 999_999_999_000);
});

test("generated contract supports multi-line invoices and null per-hectare cost", () => {
  assert.ok(CreateChemicalInvoiceBody.safeParse({
    requestId: "chemical-test-request", number: "N-1", occurredOn: "2026-10-27", supplier: "Поставщик",
    farm: "АПК Арыстан Grain", lines: [
      { name: "Гербицид", unit: "л", quantity: 100, unitPrice: 1500 },
      { name: "Удобрение", unit: "кг", quantity: 200, unitPrice: 500 },
    ],
  }).success);
  assert.ok(!CreateChemicalIssueBody.safeParse({
    requestId: "chemical-test-request", batchId: 1, seasonId: 1, employeeId: 1,
    quantity: -1, occurredOn: "2026-10-27", notes: "",
  }).success);
  assert.ok(GetChemicalWarehouseResponse.safeParse({
    batches: [], issues: [], fields: [{
      seasonId: 1, fieldId: 1, fieldNumber: "1", farm: "АПК Арыстан Grain",
      year: 2026, cropName: "Пшеница", sownAreaHa: 0, chemicalAmount: 30_000, costPerHa: null,
    }],
  }).success);
});
