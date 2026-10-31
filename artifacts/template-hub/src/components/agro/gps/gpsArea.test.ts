import assert from "node:assert/strict";
import test from "node:test";
import type { FieldDispatchItem } from "@workspace/api-client-react";
import { implementSuggestions, parseLocalDateTime, toIsoWithOffset, validateGpsForm } from "./gpsArea";

const item = (over: Record<string, unknown>) => ({ actualImplement: "", operation: undefined, ...over }) as unknown as FieldDispatchItem;

test("suggestions are distinct, trimmed, from all work sources", () => {
  const items = [
    item({ actualImplement: " Сеялка СЗ-5.4 " }),
    item({ operation: { plannedImplement: "Борона", actualImplement: "", plannedEquipmentId: 3,
      plannedAssignments: [{ equipmentId: 3, employeeId: 1, implement: "сеялка сз-5.4" }],
      actualAssignments: [{ equipmentId: 4, employeeId: 1, implement: "Культиватор" }],
      progressReports: [{ actualImplement: "", machineReports: [{ equipmentId: 3, employeeId: 1, implement: "Опрыскиватель", dailyAreaHa: 1, ratePerHa: 1 }] }] } }),
  ];
  const all = implementSuggestions(items).map((s) => s.name);
  assert.deepEqual(all.sort(), ["Борона", "Культиватор", "Опрыскиватель", "Сеялка СЗ-5.4"].sort());
  const for3 = implementSuggestions(items, 3).map((s) => s.name).sort();
  assert.deepEqual(for3, ["Борона", "Опрыскиватель", "сеялка сз-5.4"].sort());
});

test("validation", () => {
  const eq = [{ id: 7 }];
  assert.equal(validateGpsForm({ equipmentId: "8", implement: "x", startsAt: "2025-05-01T08:00", endsAt: "2025-05-01T09:00" }, eq).ok, false);
  assert.equal(validateGpsForm({ equipmentId: "7", implement: "   ", startsAt: "2025-05-01T08:00", endsAt: "2025-05-01T09:00" }, eq).ok, false);
  assert.equal(validateGpsForm({ equipmentId: "7", implement: "x".repeat(201), startsAt: "2025-05-01T08:00", endsAt: "2025-05-01T09:00" }, eq).ok, false);
  assert.equal(validateGpsForm({ equipmentId: "7", implement: "x", startsAt: "2025-05-01T09:00", endsAt: "2025-05-01T09:00" }, eq).ok, false);
  assert.equal(validateGpsForm({ equipmentId: "7", implement: "x", startsAt: "", endsAt: "2025-05-01T09:00" }, eq).ok, false);
  const ok = validateGpsForm({ equipmentId: "7", implement: " Борона ", startsAt: "2025-05-01T08:00", endsAt: "2025-05-01T18:30" }, eq);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.params.implement, "Борона");
    assert.match(ok.params.startsAt, /^2025-05-01T08:00:00[+-]\d{2}:\d{2}$/);
    assert.equal(new Date(ok.params.endsAt).getTime(), parseLocalDateTime("2025-05-01T18:30")!.getTime());
  }
});

test("invalid dates rejected and offset roundtrips", () => {
  assert.equal(parseLocalDateTime("2025-02-30T10:00"), null);
  const d = new Date(2025, 0, 15, 6, 5);
  assert.equal(new Date(toIsoWithOffset(d)).getTime(), d.getTime());
});
