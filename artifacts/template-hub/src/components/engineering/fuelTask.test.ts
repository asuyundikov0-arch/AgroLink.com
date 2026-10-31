import assert from "node:assert/strict";
import test from "node:test";
import type { SupportingTask } from "@workspace/api-client-react";
import { eligibleFuelTasks, fuelTaskFields, pickValidTask } from "./fuelTask";

const acc = [{ service: "fuel", status: "accepted", acceptedBy: "", acceptedAt: null }];
const task = (x: Partial<SupportingTask> = {}) => ({ id: 1, status: "sent", farm: "F", year: 2025, equipmentId: 7, fieldId: 3, fieldNumber: "12", operationId: 9, deliveries: acc, ...x }) as SupportingTask;

test("filters by status, fuel acceptance, farm, year, equipment", () => {
  const list = [task(), task({ id: 2, equipmentId: null }), task({ id: 3, equipmentId: 8 }), task({ id: 4, farm: "G" }), task({ id: 5, year: 2024 }), task({ id: 6, status: "draft" }),
    task({ id: 7, deliveries: [{ service: "fuel", status: "sent", acceptedBy: "", acceptedAt: null }] }), task({ id: 8, deliveries: [{ service: "tok", status: "accepted", acceptedBy: "", acceptedAt: null }] })];
  assert.deepEqual(eligibleFuelTasks(list, "F", "2025-05-02", 7).map((t) => t.id), [2, 1]);
  assert.deepEqual(eligibleFuelTasks(list, "F", "2025-05-02", ""), []);
});

test("fields dedupe and stale task guard", () => {
  const list = [task(), task({ id: 2, fieldId: 4, fieldNumber: "3" }), task({ id: 3 })];
  assert.deepEqual(fuelTaskFields(list).map((f) => f.id), [4, 3]);
  assert.equal(pickValidTask(list, 3, 1)?.id, 1);
  assert.equal(pickValidTask(list, 4, 1), null);
  assert.equal(pickValidTask(list, 3, 99), null);
});
