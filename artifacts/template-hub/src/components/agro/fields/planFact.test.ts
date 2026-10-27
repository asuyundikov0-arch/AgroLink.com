import assert from "node:assert/strict";
import test from "node:test";
import type { FieldOperation } from "@workspace/api-client-react";
import { planFactBySeason, planFactSummary } from "./planFact";

const operation = (extra: Partial<FieldOperation> = {}) => ({
  id: 1, seasonId: 10, status: "in_progress", voidedAt: null,
  isUnplanned: false, plannedAreaHa: 100, actualAreaHa: 25,
  ...extra,
}) as FieldOperation;

test("planned progress is weighted by hectares and unplanned work cannot inflate the percent", () => {
  const rows = [
    operation(),
    operation({ id: 2, isUnplanned: true, plannedAreaHa: 0, actualAreaHa: 5 }),
    operation({ id: 3, status: "cancelled", plannedAreaHa: 100, actualAreaHa: 100 }),
  ];
  assert.deepEqual(planFactSummary(rows), { plannedHa: 100, doneHa: 25, unplannedHa: 5, percent: 25 });
  assert.equal(planFactSummary([operation({ actualAreaHa: 120 })]).percent, 100);
});
test("no-plan fields have no percentage and each season is calculated independently", () => {
  const bySeason = planFactBySeason([
    operation(),
    operation({ id: 2, seasonId: 11, isUnplanned: true, plannedAreaHa: 0, actualAreaHa: 0.01 }),
  ]);
  assert.equal(bySeason.get(10)!.percent, 25);
  assert.deepEqual(bySeason.get(11), { plannedHa: 0, doneHa: 0, unplannedHa: 0.01, percent: null });
  assert.equal(planFactSummary([]).percent, null);
});
