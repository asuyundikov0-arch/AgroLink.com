import assert from "node:assert/strict";
import { test } from "node:test";
import type { FinancialEntry } from "@workspace/api-client-react";
import { summarizeFinance } from "./financial-summary";
const row = (overrides: Partial<FinancialEntry> = {}) => ({
  id: 1, book: "budget", basis: "plan", direction: "expense", date: "2026-10-01", unit: "Хозяйство",
  category: "Топливо", amountKzt: 100, status: "recorded", source: "manual", ...overrides,
} as FinancialEntry);

test("production budget uses independent monthly plan/actual, cents and custom categories", () => {
  const summary = summarizeFinance([
    row({ amountKzt: 0.1 }), row({ amountKzt: 0.2 }),
    row({ basis: "actual", amountKzt: 1.25 }),
    row({ category: "Своя статья", date: "2026-11-01", amountKzt: 10 }),
    row({ book: "cash_flow", basis: "actual", status: "completed", amountKzt: 9999 }),
  ], "budget");
  assert.equal(summary.plan[9], 0.3);
  assert.equal(summary.plan[10], 10);
  assert.equal(summary.planTotal, 10.3);
  assert.equal(summary.actualTotal, 1.25);
  assert.equal(summary.variance, -9.05);
  assert.equal(summary.categories.length, 2);
});
test("cash actual requires confirmation, net is income minus expense, no budget duplication", () => {
  const summary = summarizeFinance([
    row({ book: "cash_flow", amountKzt: 1000, direction: "income" }),
    row({ book: "cash_flow", amountKzt: 300 }),
    row({ book: "cash_flow", basis: "actual", status: "completed", direction: "income", amountKzt: 500 }),
    row({ book: "cash_flow", basis: "actual", status: "completed", amountKzt: 100.01, source: "spare_part", id: -4 }),
    row({ book: "cash_flow", basis: "actual", status: "pending", amountKzt: 200 }),
    row({ book: "cash_flow", basis: "actual", status: "pending", direction: "income", amountKzt: 700 }),
    row({ book: "cash_flow", basis: "actual", status: "voided", amountKzt: 9999 }),
    row({ basis: "actual", amountKzt: 9999 }),
  ], "cash_flow");
  assert.equal(summary.planTotal, 700);
  assert.equal(summary.actualTotal, 399.99);
  assert.equal(summary.incomeActual, 500);
  assert.equal(summary.expenseActual, 100.01);
  assert.equal(summary.pendingExpense, 200);
  assert.equal(summary.pendingIncome, 700);
});
test("unit filter and voided rows don't leak into totals", () => {
  const summary = summarizeFinance([row(), row({ unit: "Другое", amountKzt: 500 }), row({ status: "voided", amountKzt: 1000 })], "budget", "Хозяйство");
  assert.equal(summary.planTotal, 100);
  assert.equal(summarizeFinance([], "cash_flow").actualTotal, 0);
});
