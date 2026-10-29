import assert from "node:assert/strict";
import { test } from "node:test";
import type { Employee, PayrollRegister, PayrollRegisterEntry } from "@workspace/api-client-react";
import { buildHRRoster, groupOf, PAYROLL_GROUPS } from "./payrollGroups";

const employee = (id: number, name: string, payrollGroup: string | null = null, isActive = true) => ({
  id, fullName: name, department: "Хозяйство", position: "Специалист", payrollGroup, isActive,
} as Employee);
const entry = (id: number | null, name: string, amount: number): PayrollRegisterEntry => ({
  id: Math.round(amount), employeeId: id, employeeName: name, amountKzt: amount,
  workType: "Работа", details: "Источник", sourceType: "field_progress", sourceId: null,
});
const sheet = (id: number, entries: PayrollRegisterEntry[], status: PayrollRegister["status"] = "sent_to_economist", workDate = "2026-10-28") => ({
  id, entries, status, workDate, unit: "Хозяйство", totalAmount: entries.reduce((sum, row) => sum + row.amountKzt, 0),
} as PayrollRegister);

test("five requested groups, no guessed assignment and staff with zero payroll remain visible", () => {
  assert.deepEqual(PAYROLL_GROUPS.map(([, label]) => label), ["Бригада", "Автобаза", "Ток", "МТМ", "Машдвор"]);
  const rows = buildHRRoster([employee(1, "А", "brigade"), employee(2, "Б")], []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].confirmed, 0);
  assert.equal(rows[1].group, "unassigned");
  assert.equal(groupOf(employee(3, "В", "unexpected")), "unassigned");
});
test("pending, confirmed, drafts and month boundaries never mix", () => {
  const rows = buildHRRoster([employee(1, "А", "brigade")], [
    sheet(1, [entry(1, "А", 100)]), sheet(2, [entry(1, "А", 50)], "pending_hr"),
    sheet(3, [entry(1, "А", 999)], "draft"), sheet(4, [entry(1, "А", 200)], "sent_to_economist", "2026-09-01"),
  ], "2026-10");
  assert.equal(rows[0].confirmed, 100);
  assert.equal(rows[0].pending, 50);
  assert.deepEqual(rows[0].pendingRegisterIds, [2]);
  assert.equal(rows[0].lines[0].registerId, 1);
});
test("field payroll remains in brigade when the employee directory group changes", () => {
  const registers = [sheet(1, [entry(1, "Старое имя", 120)])];
  const before = buildHRRoster([employee(1, "Новое имя", "brigade")], registers)[0];
  const after = buildHRRoster([employee(1, "Новое имя", "workshop")], registers)[0];
  assert.equal(before.key, after.key);
  assert.equal(after.name, "Новое имя");
  assert.equal(after.group, "brigade");
  assert.equal(after.confirmed, before.confirmed);
  assert.equal(registers[0].entries[0].amountKzt, 120);
});
test("inactive staff and unmatched legacy amounts are retained without ambiguous-name merges", () => {
  const staff = [employee(1, "Иванов", "brigade", false), employee(2, "Иванов", "motor_pool")];
  const rows = buildHRRoster(staff, [sheet(1, [entry(1, "Иванов", 100), entry(2, "Иванов", 200), entry(null, "Иванов", 300), entry(99, "Нет карточки", 400)])]);
  assert.equal(rows.length, 4);
  assert.equal(rows.reduce((sum, row) => sum + row.confirmed, 0), 1000);
  assert.equal(rows.filter((row) => row.group === "brigade").length, 4);
});
test("unique historical names resolve to stable IDs but no arbitrary department inference occurs", () => {
  const rows = buildHRRoster([employee(1, "Федоров", "grain_floor")], [sheet(1, [entry(null, "  ФЁДОРОВ ", 25)])]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "id-1|brigade");
  assert.equal(rows[0].confirmed, 25);
});
test("one employee can have separate field and motor-pool lines without double-counting", () => {
  const transport = { ...entry(1, "А", 300), sourceType: "grain_trip" };
  const rows = buildHRRoster([employee(1, "А", "workshop")], [
    sheet(1, [entry(1, "А", 100)]), sheet(2, [transport], "pending_hr"),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.group === "brigade")?.confirmed, 100);
  assert.equal(rows.find(row => row.group === "motor_pool")?.pending, 300);
  assert.equal(rows.reduce((sum, row) => sum + row.confirmed + row.pending, 0), 400);
});
