import assert from "node:assert/strict";
import test from "node:test";
import type { PayrollRegister, PayrollRegisterEntry } from "@workspace/api-client-react";
import { aggregatePayrollByEmployee } from "./payrollCumulative";

const entry = (id: number, employeeId: number | null, employeeName: string, amountKzt: number, workType = "Посев"): PayrollRegisterEntry => ({
  id, employeeId, employeeName, amountKzt, workType, details: "10 га × расценка",
  sourceType: "field_progress", sourceId: id,
});
const sheet = (id: number, workDate: string, entries: PayrollRegisterEntry[], status: PayrollRegister["status"] = "sent_to_economist"): PayrollRegister => ({
  id, workDate, unit: "Хозяйство", status, entries,
  totalAmount: entries.reduce((sum, line) => sum + line.amountKzt, 0), version: 1,
  createdByName: "Диспетчер", submittedByName: "Диспетчер",
  createdAt: `${workDate}T12:00:00Z`, submittedAt: `${workDate}T12:00:00Z`,
});

test("economist accumulates every confirmed line with work-type and date details, not drafts", () => {
  const records = [
    sheet(1, "2026-09-01", [entry(1, 7, "Иванов", 11000)]),
    sheet(2, "2026-09-02", [entry(2, 7, "Иванов", 16500), entry(3, 7, "Иванов", 3500, "Перевозка")]),
    sheet(3, "2026-09-02", [entry(4, 7, "Иванов", 500, "Перевозка")]),
    sheet(4, "2026-09-02", [entry(5, 7, "Иванов", 99999)], "draft"),
  ];
  const [employee] = aggregatePayrollByEmployee(records);
  assert.equal(employee.total, 31500);
  assert.equal(employee.lineCount, 4);
  assert.deepEqual(employee.registerIds, [1, 2, 3]);
  assert.equal(employee.workTypes.find((type) => type.workType === "Посев")!.total, 27500);
  assert.equal(employee.workTypes.find((type) => type.workType === "Перевозка")!.total, 4000);
  assert.equal(employee.lines[0].workDate, "2026-09-01");
  assert.equal(employee.lines[0].details, "10 га × расценка");
  assert.equal(aggregatePayrollByEmployee(records, { from: "2026-09-02", to: "2026-09-02" })[0].total, 20500);
  assert.equal(aggregatePayrollByEmployee(records, { search: "несуществующий" }).length, 0);
});

test("legacy names join unique known IDs but never merge different employees with identical names", () => {
  const legacy = sheet(1, "2026-09-01", [entry(1, null, "  ФЁДОРОВ  ", 100)]);
  const known = sheet(2, "2026-09-02", [entry(2, 7, "Федоров", 200)]);
  const combined = aggregatePayrollByEmployee([legacy, known], { to: "2026-09-01" });
  assert.equal(combined[0].employeeId, 7);
  assert.equal(combined[0].total, 100);
  const ambiguous = aggregatePayrollByEmployee([legacy, known, sheet(3, "2026-09-02", [entry(3, 8, "Федоров", 300)])]);
  assert.equal(ambiguous.length, 3);
  assert.equal(ambiguous.reduce((sum, group) => sum + group.total, 0), 600);
});
