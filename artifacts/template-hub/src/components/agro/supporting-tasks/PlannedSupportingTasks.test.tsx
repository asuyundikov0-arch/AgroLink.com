import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgroField, FieldOperation } from "@workspace/api-client-react";
import { PlannedSupportingTasks, canCreateFromOperation } from "./PlannedSupportingTasks";
import { buildItems, initialRows, manualRow, payloadHash, requestIdFor, rowsFromPlan } from "./batchRows";
import { plannedTaskDefaults } from "./taskDefaults";

const field = { id: 1, number: "5", unit: "АПК Арыстан Grain", isActive: true } as AgroField;
const work = { name: "Подвоз семян", equipmentId: 100, employeeIds: [200], employeeNames: ["Сотрудник А"],
  salaryCost: 1234.50, fuelCost: 555, seedName: "", seedQuantity: 0, seedUnit: "kg", seedPrice: 0 };
const op = { id: 321, status: "in_progress", isUnplanned: false, name: "Посев",
  plannedStart: "2026-05-01", plannedEnd: "2026-05-31", supportingWorks: [work, {
    ...work, name: "Заправка сеялки", equipmentId: 101, employeeIds: [201, 202], salaryCost: 6789, fuelCost: 300,
  }] } as FieldOperation;

test("summary lists all planned works without per-row create buttons", () => {
  const html = renderToStaticMarkup(<PlannedSupportingTasks operation={op} field={field} year={2026} role="agronomist" />);
  assert.ok(html.includes("text-support-plan-321-row-0") && html.includes("text-support-plan-321-row-1"));
  assert.ok(!html.includes("button-support-task-create"));
});

test("eligibility: writers on active non-closed ops, incl. empty plan and approved unplanned", () => {
  assert.ok(canCreateFromOperation("agronomist", field, op));
  assert.ok(canCreateFromOperation("general_director", field, { ...op, supportingWorks: [] }));
  assert.ok(canCreateFromOperation("agronomist", field, { ...op, isUnplanned: true, approvalStatus: "approved" } as FieldOperation));
  assert.ok(!canCreateFromOperation("agronomist", field, { ...op, isUnplanned: true, approvalStatus: "pending" } as FieldOperation));
  for (const role of ["chief_agronomist", "weigher", "dispatcher"]) assert.ok(!canCreateFromOperation(role, field, op));
  for (const status of ["completed", "cancelled"] as const) assert.ok(!canCreateFromOperation("agronomist", field, { ...op, status }));
  assert.ok(!canCreateFromOperation("agronomist", { ...field, isActive: false }, op));
});

test("prefill copies all planned rows by index without mutating the plan", () => {
  const rows = rowsFromPlan(op);
  assert.deepEqual(rows.map((r) => r.sourceIndex), [0, 1]);
  assert.equal(rows[1].title, "Заправка сеялки");
  assert.deepEqual(rows[1].employeeIds, [201, 202]);
  rows[1].employeeIds.pop(); rows[1].title = "x";
  assert.deepEqual(op.supportingWorks![1].employeeIds, [201, 202]);
  assert.equal(op.supportingWorks![1].name, "Заправка сеялки");
  assert.equal(rows[0].salary, "1234,5");
});

test("empty plan starts with one manual row; manual rows send null sourceIndex", () => {
  const rows = initialRows({ ...op, supportingWorks: [] });
  assert.equal(rows.length, 1); assert.equal(rows[0].sourceIndex, null);
  const a = { ...manualRow(op), title: "Вывоз мусора", services: ["tok" as const] };
  const b = { ...manualRow(op), title: "Подвоз воды", services: ["fuel" as const] };
  const { items, errors } = buildItems(321, [a, b]);
  assert.deepEqual(errors, {});
  assert.deepEqual(items.map((i) => [i.sourceIndex, i.services]), [[null, ["tok"]], [null, ["fuel"]]]);
});

test("remove/add keeps source indexes immutable; duplicates and missing services rejected", () => {
  const plan = rowsFromPlan(op).map((r) => ({ ...r, services: ["motor_pool" as const] }));
  const { items } = buildItems(321, [plan[1], { ...manualRow(op), title: "Доп.", services: ["tok"] }]);
  assert.deepEqual(items.map((i) => i.sourceIndex), [1, null]);
  assert.ok(items.every((i) => i.operationId === 321));
  const dup = buildItems(321, [plan[0], { ...plan[0], key: "dup" }]);
  assert.ok(dup.errors.dup);
  const none = buildItems(321, [{ ...plan[0], services: [] }]);
  assert.equal(none.items.length, 0);
  assert.ok(buildItems(321, []).general.length > 0);
});

test("requestId reused for identical payload, renewed after change", () => {
  const items = buildItems(321, rowsFromPlan(op).map((r) => ({ ...r, services: ["tok" as const] }))).items;
  const c1 = requestIdFor(null, payloadHash(true, items));
  assert.equal(requestIdFor(c1, payloadHash(true, items)).id, c1.id);
  assert.notEqual(requestIdFor(c1, payloadHash(false, items)).id, c1.id);
});

test("legacy single-row defaults still copy the chosen row", () => {
  assert.equal(plannedTaskDefaults(op, 1).title, "Заправка сеялки");
});
