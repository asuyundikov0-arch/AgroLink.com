import assert from "node:assert/strict";
import test from "node:test";
import { ledgerTotals, legacyExpenseAmounts, registrationKey } from "./repair-ledger";

test("expense ledger adds each transaction exactly once and includes details in current repairs", () => {
  const totals = ledgerTotals([
    { category: "capital", amount: "100000.00" }, { category: "current", amount: "7000.00" },
    { category: "tires", amount: "10000.00" }, { category: "oils", amount: "5000.00" },
    { category: "service", amount: "5000.00" },
  ]);
  assert.deepEqual(totals, { capitalCost: 100000, currentCost: 27000, tiresCost: 10000, oilsCost: 5000, serviceCost: 5000 });
});
test("migration preserves old total, separates current remainder, and does not double count details", () => {
  const original = { capitalCost: 100000, currentCost: 30000, tiresCost: 10000, oilsCost: 5000, serviceCost: 5000 };
  assert.deepEqual(ledgerTotals(legacyExpenseAmounts(original)), original);
});
test("zero previously entered stays explicit, truly missing expenses stay unknown", () => {
  assert.equal(ledgerTotals(legacyExpenseAmounts({ capitalCost: 0, currentCost: 0, tiresCost: null, oilsCost: null, serviceCost: null })).currentCost, 0);
  assert.equal(ledgerTotals([]).capitalCost, null);
});
test("money aggregates using integer minor units", () => {
  assert.equal(ledgerTotals([{ category: "current", amount: "0.10" }, { category: "tires", amount: "0.20" }]).currentCost, 0.3);
});
test("registration uniqueness is case, whitespace and hyphen insensitive", () => {
  assert.equal(registrationKey(" 123-ab 01 "), registrationKey("123AB01"));
  assert.equal(registrationKey("Ａ１２３"), registrationKey("A123"));
});
