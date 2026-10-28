import type { FinancialEntry } from "@workspace/api-client-react";

export type FinancialSummaryRow = {
  key: string; category: string; direction: FinancialEntry["direction"];
  plan: number[]; actual: number[]; planTotal: number; actualTotal: number;
};
export function summarizeFinance(entries: FinancialEntry[], book: FinancialEntry["book"], unit = "") {
  const rows = new Map<string, FinancialSummaryRow>();
  let pendingIncome = 0, pendingExpense = 0;
  for (const entry of entries) {
    if (entry.book !== book || entry.status === "voided" || (unit && entry.unit !== unit)) continue;
    const cents = Math.round(entry.amountKzt * 100);
    if (entry.status === "pending") {
      if (entry.direction === "income") pendingIncome += cents;
      else pendingExpense += cents;
      continue;
    }
    const month = Number(entry.date.slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;
    const key = `${entry.direction}:${entry.category}`;
    if (!rows.has(key)) rows.set(key, { key, category: entry.category, direction: entry.direction, plan: Array(12).fill(0), actual: Array(12).fill(0), planTotal: 0, actualTotal: 0 });
    const row = rows.get(key)!;
    const values = entry.basis === "plan" ? row.plan : row.actual;
    values[month] += cents;
  }
  const plan = Array<number>(12).fill(0), actual = Array<number>(12).fill(0);
  let incomeActual = 0, expenseActual = 0;
  const categories = [...rows.values()].sort((a, b) => a.direction.localeCompare(b.direction) || a.category.localeCompare(b.category, "ru"));
  for (const row of categories) {
    const sign = book === "cash_flow" && row.direction === "expense" ? -1 : 1;
    row.plan.forEach((amount, month) => { plan[month] += sign * amount; row.plan[month] = amount / 100; });
    row.actual.forEach((amount, month) => {
      actual[month] += sign * amount; row.actual[month] = amount / 100;
      if (row.direction === "income") incomeActual += amount; else expenseActual += amount;
    });
    row.planTotal = Math.round(row.plan.reduce((sum, value) => sum + Math.round(value * 100), 0)) / 100;
    row.actualTotal = Math.round(row.actual.reduce((sum, value) => sum + Math.round(value * 100), 0)) / 100;
  }
  const planTotal = plan.reduce((sum, value) => sum + value, 0) / 100;
  const actualTotal = actual.reduce((sum, value) => sum + value, 0) / 100;
  return {
    categories, plan: plan.map((value) => value / 100), actual: actual.map((value) => value / 100),
    planTotal, actualTotal, variance: Math.round((actualTotal - planTotal) * 100) / 100,
    incomeActual: incomeActual / 100, expenseActual: expenseActual / 100,
    pendingIncome: pendingIncome / 100, pendingExpense: pendingExpense / 100,
  };
}
