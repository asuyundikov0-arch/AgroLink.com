import assert from "node:assert/strict";
import { test } from "node:test";
import type { Employee, PayrollRegister } from "@workspace/api-client-react";
import { buildHRRoster } from "./payrollGroups";

test("tok accruals belong to Ток even when the same employee has field and transport wages", () => {
  const employee = { id: 701, fullName: "Рабочий теста", isActive: true, payrollGroup: "motor_pool" } as Employee;
  const register = {
    id: 10, workDate: "2020-03-11", unit: "Тестовое хозяйство", status: "pending_hr",
    entries: [
      { id: 1, employeeId: employee.id, employeeName: employee.fullName, sourceType: "tok_work", amountKzt: 21000 },
      { id: 2, employeeId: employee.id, employeeName: employee.fullName, sourceType: "grain_trip", amountKzt: 5000 },
      { id: 3, employeeId: employee.id, employeeName: employee.fullName, sourceType: "field_progress", amountKzt: 1000 },
    ],
  } as PayrollRegister;
  const pending = buildHRRoster([employee], [register]);
  assert.equal(pending.length, 3);
  assert.equal(pending.find(row => row.group === "grain_floor")?.pending, 21000);
  assert.equal(pending.find(row => row.group === "motor_pool")?.pending, 5000);
  assert.equal(pending.find(row => row.group === "brigade")?.pending, 1000);
  assert.equal(pending.reduce((sum, row) => sum + row.pending, 0), 27000);
  assert.equal(pending.reduce((sum, row) => sum + row.confirmed, 0), 0);
  const confirmed = buildHRRoster([employee], [{ ...register, status: "sent_to_economist" }]);
  assert.equal(confirmed.find(row => row.group === "grain_floor")?.confirmed, 21000);
  assert.equal(confirmed.reduce((sum, row) => sum + row.pending, 0), 0);
});
