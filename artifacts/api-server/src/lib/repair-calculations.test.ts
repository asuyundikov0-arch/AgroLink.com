import assert from "node:assert/strict";
import test from "node:test";
import type { RepairEntry, RepairInput } from "@workspace/api-zod";
import { calculateRepair, dayDifference, repairBusinessDate, summarizeRepairs, validateRepairInput } from "./repair-calculations";

const blank: RepairInput = {
  equipment: "Трактор · А001", responsible: "Ответственный", unit: "АПК Арыстан Grain",
  plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, readiness: null,
  capitalCost: null, currentCost: null, tiresCost: null, oilsCost: null, serviceCost: null, notes: "",
};
const today = "2026-10-23";

test("empty financial and date fields remain unknown, not fabricated zeros", () => {
  const value = calculateRepair(blank, today);
  assert.equal(value.totalCost, null);
  assert.equal(value.readiness, null);
  assert.equal(value.deviationDays, null);
  assert.equal(value.deviationPercent, null);
  assert.equal(value.status, "planned");
});

test("cost is capital + current only; detail costs are never counted twice", () => {
  const value = calculateRepair({ ...blank, capitalCost: 100000, currentCost: 20000, tiresCost: 10000, oilsCost: 5000, serviceCost: 5000 }, today);
  assert.equal(value.totalCost, 120000);
});

test("rounding in minor units avoids a 0.1+0.2 money artefact and preserves explicit zero", () => {
  assert.equal(calculateRepair({ ...blank, capitalCost: 0.1, currentCost: 0.2 }, today).totalCost, 0.3);
  assert.equal(calculateRepair({ ...blank, capitalCost: 0 }, today).totalCost, 0);
});

test("completed repair uses exact workbook date and duration deviation formulas", () => {
  const value = calculateRepair({
    ...blank, plannedStart: "2026-10-01", plannedEnd: "2026-10-11",
    actualStart: "2026-10-03", actualEnd: "2026-10-15", readiness: 60,
  }, today);
  assert.equal(value.deviationDays, 4);
  assert.equal(value.deviationPercent, 20);
  assert.equal(value.status, "completed");
  assert.equal(value.readiness, 100);
});

test("earlier completion produces negative deviations", () => {
  const value = calculateRepair({
    ...blank, plannedStart: "2026-10-01", plannedEnd: "2026-10-11",
    actualStart: "2026-10-01", actualEnd: "2026-10-09",
  }, today);
  assert.equal(value.deviationDays, -2);
  assert.equal(value.deviationPercent, -20);
});

test("same-day planned duration uses MAX(1,duration) rather than dividing by zero", () => {
  const value = calculateRepair({
    ...blank, plannedStart: "2026-10-01", plannedEnd: "2026-10-01",
    actualStart: "2026-10-01", actualEnd: "2026-10-03",
  }, today);
  assert.equal(value.deviationPercent, 200);
});

test("unfinished overdue repair shows overdue days separately from final deviations", () => {
  const value = calculateRepair({ ...blank, plannedEnd: "2026-10-20", actualStart: "2026-10-01", readiness: 50 }, today);
  assert.equal(value.overdueDays, 3);
  assert.equal(value.status, "overdue");
  assert.equal(value.deviationDays, null);
  assert.equal(value.deviationPercent, null);
  assert.equal(calculateRepair({ ...blank, plannedEnd: today }, today).overdueDays, 0);
});

test("calendar arithmetic and business-date rollover are timezone-safe", () => {
  assert.equal(dayDifference("2024-03-01", "2024-02-28"), 2);
  assert.equal(repairBusinessDate(new Date("2026-10-22T20:00:00Z")), "2026-10-23");
});

test("invalid dates, reverse dates, missing actual start and future actual dates are rejected", () => {
  assert.ok(validateRepairInput({ ...blank, plannedEnd: "2026-02-30" }, today));
  assert.ok(validateRepairInput({ ...blank, plannedEnd: "2026-2-3" }, today));
  assert.ok(validateRepairInput({ ...blank, plannedStart: "2026-10-05", plannedEnd: "2026-10-01" }, today));
  assert.ok(validateRepairInput({ ...blank, actualEnd: today }, today));
  assert.ok(validateRepairInput({ ...blank, actualStart: "2026-10-25" }, today));
  assert.equal(validateRepairInput({ ...blank, plannedEnd: "2026-12-01" }, today), null);
});

test("detail cannot exceed current cost; blanks and zero details are allowed", () => {
  assert.ok(validateRepairInput({ ...blank, currentCost: 10, tiresCost: 11 }, today));
  assert.ok(validateRepairInput({ ...blank, tiresCost: 1 }, today));
  assert.equal(validateRepairInput({ ...blank, tiresCost: 0 }, today), null);
  assert.equal(validateRepairInput({ ...blank, currentCost: 0.3, tiresCost: 0.1, oilsCost: 0.2 }, today), null);
});

test("whitespace-only identity and nonfinite/excess-precision costs are rejected", () => {
  assert.ok(validateRepairInput({ ...blank, equipment: "   " }, today));
  assert.ok(validateRepairInput({ ...blank, currentCost: Infinity }, today));
  assert.ok(validateRepairInput({ ...blank, currentCost: 1.234 }, today));
});

test("summary excludes unknown readiness and flags incomplete costs", () => {
  const entries = [blank, { ...blank, actualStart: "2026-10-01", readiness: 60, capitalCost: 10, currentCost: 20 }]
    .map((input, index): RepairEntry => ({
      ...input, ...calculateRepair(input, today), id: index + 1, fleetId: index + 1, registrationNumber: null, version: 1,
      createdBy: "test", updatedBy: "test", updatedAt: new Date().toISOString(),
    }));
  const summary = summarizeRepairs(entries);
  assert.equal(summary.total, 2);
  assert.equal(summary.totalCost, 30);
  assert.equal(summary.averageReadiness, 60);
  assert.equal(summary.unpricedCount, 1);
  assert.equal(summary.planned, 1);
  assert.equal(summary.inProgress, 1);
  assert.equal(summarizeRepairs([]).averageReadiness, null);
});
