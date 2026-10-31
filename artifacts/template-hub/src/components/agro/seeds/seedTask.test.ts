import assert from "node:assert/strict";
import test from "node:test";
import type { SupportingTask } from "@workspace/api-client-react";
import { eligibleSeedTasks, splitSalary, validateSeedTransport } from "./seedTask";

const task = (x: Partial<SupportingTask> = {}) => ({ id: 1, status: "sent", fieldId: 5, year: 2025, operationId: 9, deliveries: [{ service: "tok", status: "accepted", acceptedBy: "", acceptedAt: null }], ...x }) as SupportingTask;
const season = { id: 3, fieldId: 5, year: 2025 };
const ops = [{ id: 9, seasonId: 3, status: "in_progress" as const }, { id: 10, seasonId: 3, status: "completed" as const }];

test("only accepted tok tasks of the same field/year and active sowing op", () => {
  const list = [task(), task({ id: 2, deliveries: [{ service: "tok", status: "sent", acceptedBy: "", acceptedAt: null }] }), task({ id: 3, year: 2024 }), task({ id: 4, fieldId: 6 }), task({ id: 5, operationId: 10 }), task({ id: 6, status: "draft" }),
    task({ id: 7, deliveries: [{ service: "motor_pool", status: "accepted", acceptedBy: "", acceptedAt: null }] })];
  assert.deepEqual(eligibleSeedTasks(list, season, ops).map((t) => t.id), [1]);
  assert.deepEqual(eligibleSeedTasks(list, undefined, ops), []);
});

test("transport: required with task, all-or-nothing otherwise", () => {
  const empty = { truckNumber: "", driverEmployeeId: "", basis: "per_trip" as const, distanceKm: "" };
  assert.equal(validateSeedTransport(empty, false).payload, null);
  assert.deepEqual(Object.keys(validateSeedTransport(empty, false).errors), []);
  assert.deepEqual(Object.keys(validateSeedTransport(empty, true).errors).sort(), ["driverEmployeeId", "truckNumber"]);
  assert.ok(validateSeedTransport({ ...empty, truckNumber: "A1" }, false).errors.driverEmployeeId);
  assert.ok(validateSeedTransport({ truckNumber: "A1", driverEmployeeId: "4", basis: "ton_km", distanceKm: "" }, true).errors.distanceKm);
  assert.deepEqual(validateSeedTransport({ truckNumber: " A1 ", driverEmployeeId: "4", basis: "ton_km", distanceKm: "12,5" }, true).payload, { truckNumber: "A1", driverEmployeeId: 4, transportPayBasis: "ton_km", distanceKm: 12.5 });
});

test("salary split never double counts", () => {
  assert.deepEqual(splitSalary(1000, 300), { field: 700, transport: 300 });
  assert.deepEqual(splitSalary(1000), { field: 1000, transport: 0 });
  assert.deepEqual(splitSalary(100, 500), { field: 0, transport: 100 });
});
