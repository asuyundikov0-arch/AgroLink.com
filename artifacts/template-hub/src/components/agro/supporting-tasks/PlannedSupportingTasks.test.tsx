import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgroField, FieldOperation } from "@workspace/api-client-react";
import { PlannedSupportingTasks } from "./PlannedSupportingTasks";
import { plannedTaskDefaults } from "./taskDefaults";

const field = { id: 1, number: "5", unit: "АПК Арыстан Grain", isActive: true } as AgroField;
const work = { name: "Подвоз семян", equipmentId: 100, employeeIds: [200], employeeNames: ["Сотрудник А"],
  salaryCost: 1234.50, fuelCost: 555, seedName: "", seedQuantity: 0, seedUnit: "kg", seedPrice: 0 };
const op = { id: 321, status: "in_progress", isUnplanned: false, name: "Посев",
  plannedStart: "2026-05-01", plannedEnd: "2026-05-31", supportingWorks: [work, {
    ...work, name: "Заправка сеялки", equipmentId: 101, employeeIds: [201, 202], salaryCost: 6789, fuelCost: 300,
  }] } as FieldOperation;
const render = (role = "agronomist", operation = op, currentField = field) =>
  renderToStaticMarkup(<PlannedSupportingTasks operation={operation} field={currentField} year={2026} role={role} />);

test("each planned supporting row in facts has its own create button, including an active operation", () => {
  const html = render();
  for (const index of [0, 1]) {
    const row = html.slice(html.indexOf(`data-testid="text-support-plan-321-row-${index}"`)).split("</li>")[0];
    assert.ok(row.includes(`data-testid="button-support-task-create-321-${index}"`));
  }
  assert.ok(render("general_director").includes("Создать задание"));
  assert.ok(render("agronomist", { ...op, status: "planned" }).includes("Создать задание"));
});
test("readonly roles, closed operations, unplanned operations and inactive fields cannot create", () => {
  for (const role of ["chief_agronomist", "weigher", "grain_manager", "dispatcher"])
    assert.ok(!render(role).includes("button-support-task-create"));
  for (const status of ["completed", "cancelled"] as const)
    assert.ok(!render("agronomist", { ...op, status }).includes("button-support-task-create"));
  assert.ok(!render("agronomist", { ...op, isUnplanned: true }).includes("button-support-task-create"));
  assert.ok(!render("agronomist", op, { ...field, isActive: false }).includes("button-support-task-create"));
});
test("prefill copies the clicked second work, not the first work, without mutable employee references", () => {
  const defaults = plannedTaskDefaults(op, 1);
  assert.deepEqual(defaults, { title: "Заправка сеялки", startDate: "2026-05-01", endDate: "2026-05-31",
    equipmentId: 101, employeeIds: [201, 202], salary: "6789", fuel: "300" });
  defaults.employeeIds.pop(); defaults.title = "Другая работа";
  assert.equal(op.supportingWorks![1].name, "Заправка сеялки");
  assert.deepEqual(op.supportingWorks![1].employeeIds, [201, 202]);
  assert.equal(plannedTaskDefaults(op, 0).salary, "1234,5");
});
