import assert from "node:assert/strict";
import test from "node:test";
import type { FieldActualInput, FieldOperationInput } from "@workspace/api-zod";
import { fieldNumberKey, fieldOperationState, toAreaAres, validateFieldActual, validateFieldPlan } from "./field-planning";

const plan = (extra: Partial<FieldOperationInput> = {}): FieldOperationInput => ({
  seasonId: 1, name: "Посев", plannedStart: "2026-05-01", plannedEnd: "2026-05-10",
  plannedAreaHa: 120.25, responsible: "", notes: "", ...extra,
});
const fact = (extra: Partial<FieldActualInput> = {}): FieldActualInput => ({
  version: 1, actualStart: "2026-05-03", actualEnd: null, actualAreaHa: 25.75, actualNotes: "", ...extra,
});
const state = (extra = {}) => ({
  actualStart: null, actualEnd: null, actualAreaAres: 0, plannedAreaAres: 12025,
  plannedEnd: "2026-05-10", voidedAt: null, ...extra,
});
test("area accounting preserves hundredths of hectare exactly", () => {
  assert.equal(toAreaAres(120.25), 12025);
  assert.equal(toAreaAres(0.01), 1);
  assert.equal(toAreaAres(1000000), 100000000);
  assert.equal(toAreaAres(0, true), 0);
  for (const n of [0, -1, NaN, Infinity, 1.001, 1000000.01]) assert.equal(toAreaAres(n), null);
});
test("field numbers are unique within a farm after normalization, not restricted to numbers", () => {
  assert.equal(fieldNumberKey(" 12А "), fieldNumberKey("12а"));
  assert.equal(fieldNumberKey(" №  12 "), fieldNumberKey("№ 12"));
  assert.notEqual(fieldNumberKey("12А"), fieldNumberKey("12Б"));
});
test("planned operations accept future dates and exact seasonal area", () => {
  assert.equal(validateFieldPlan(plan(), 12025), null);
  assert.equal(validateFieldPlan(plan({ plannedStart: "2027-05-01", plannedEnd: "2027-05-02" }), 12025), null);
});
test("plan rejects missing name, invalid calendar/order and out-of-field area", () => {
  for (const change of [
    { name: " " }, { plannedStart: "2026-02-30" }, { plannedEnd: "2026-04-30" },
    { plannedAreaHa: 120.26 }, { plannedAreaHa: 0 }, { plannedAreaHa: 1.001 },
  ]) assert.ok(validateFieldPlan(plan(change), 12025));
});
test("actuals may be partial or completed below planned area without pretending full coverage", () => {
  assert.equal(validateFieldActual(fact(), 12025, "2026-10-23"), null);
  assert.equal(validateFieldActual(fact({ actualEnd: "2026-05-04" }), 12025, "2026-10-23"), null);
  const result = fieldOperationState(state({ actualStart: "2026-05-03", actualEnd: "2026-05-04", actualAreaAres: 2575 }), "2026-10-23");
  assert.equal(result.status, "completed");
  assert.equal(result.progressPercent, 21.41);
  assert.equal(result.isOverdue, false);
});
test("actual dates reject future, invalid dates and reversed ranges", () => {
  for (const change of [
    { actualStart: "2026-10-24" }, { actualEnd: "2026-10-24" }, { actualStart: "2026-02-30" },
    { actualEnd: "2026-05-02" },
  ]) assert.ok(validateFieldActual(fact(change), 12025, "2026-10-23"));
});
test("actual area needs a start, positive completion and cannot exceed planned area", () => {
  for (const change of [
    { actualStart: null }, { actualAreaHa: 120.26 }, { actualAreaHa: -1 }, { actualAreaHa: 1.001 },
    { actualEnd: "2026-05-04", actualAreaHa: 0 },
  ]) assert.ok(validateFieldActual(fact(change), 12025, "2026-10-23"));
  assert.equal(validateFieldActual(fact({ actualAreaHa: 0 }), 12025, "2026-10-23"), null);
  assert.equal(validateFieldActual(fact({ actualStart: null, actualAreaHa: 0 }), 12025, "2026-10-23"), null);
});
test("overdue is derived from business date and ignores completed or cancelled work", () => {
  assert.equal(fieldOperationState(state(), "2026-05-10").isOverdue, false);
  assert.equal(fieldOperationState(state(), "2026-05-11").isOverdue, true);
  assert.equal(fieldOperationState(state({ actualStart: "2026-05-03" }), "2026-05-11").status, "in_progress");
  assert.equal(fieldOperationState(state({ actualStart: "2026-05-03" }), "2026-05-11").isOverdue, true);
  const cancelled = fieldOperationState(state({ voidedAt: new Date() }), "2026-05-11");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.isOverdue, false);
});
test("zero denominator in an incomplete legacy row never creates non-finite progress", () => {
  assert.equal(fieldOperationState(state({ plannedAreaAres: 0 })).progressPercent, 0);
});
