import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express, { type RequestHandler } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db, pool, agroFieldsTable, fieldSeasonsTable, fieldOperationsTable, fieldOperationProgressTable,
  employeesTable, fleetEquipmentTable, payrollRegistersTable, payrollRegisterItemsTable, activityTable,
} from "@workspace/db";
import router from "../routes/agro-fields";
import { calculateAutomaticAccruals } from "../routes/payroll-registers";
import { grainBusinessDate } from "./grain-ledger";
import { fieldCosts } from "./field-costs";
import { resolveMachineReports } from "./field-machine-assignments";

after(() => pool.end());

test("two machines: one plan, daily snapshots per employee, summed hectares, separate protected payroll", async () => {
  const key = `multi-${randomUUID()}`;
  const today = grainBusinessDate();
  const unit = "АПК Арыстан Grain";
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    const role = String(req.headers["x-test-role"]);
    res.locals.access = { userId: key, displayName: key, role, email: "", department: "" }; next();
  });
  type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
  for (const layer of (router as unknown as { stack: Layer[] }).stack) {
    if (!layer.route) continue;
    const r = layer.route;
    for (const method of ["get", "post", "patch"] as const)
      if (r.methods[method]) app[method](r.path, ...r.stack.map(s => s.handle));
  }
  const server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (role: string, method: string, path: string, data: unknown, status = 200) => {
    const res = await fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json", "x-test-role": role }, body: JSON.stringify(data) });
    const result = await res.json() as any;
    assert.equal(res.status, status, JSON.stringify(result)); return result;
  };
  let fieldId = 0, seasonId = 0, registerId = 0;
  let employeeIds: number[] = [], machineIds: number[] = [];
  try {
    const [field] = await db.insert(agroFieldsTable).values({ unit, number: key, numberKey: key, areaAres: 10000, updatedBy: key }).returning();
    fieldId = field.id;
    const [season] = await db.insert(fieldSeasonsTable).values({ fieldId, year: Number(today.slice(0, 4)), cropName: "Пшеница", areaAres: 10000, updatedBy: key }).returning();
    seasonId = season.id;
    const people = await db.insert(employeesTable).values([1, 2].map(i => ({ fullName: `${key}-${i}`, createdBy: key, updatedBy: key }))).returning();
    employeeIds = people.map(p => p.id);
    const machines = await db.insert(fleetEquipmentTable).values([1, 2].map(i => ({ unit, kind: "Трактор", registrationNumber: `${key}-${i}`, registrationKey: `${key}-${i}`, updatedBy: key }))).returning();
    machineIds = machines.map(m => m.id);
    const assignments = machines.map((m, i) => ({ equipmentId: m.id, employeeId: people[i].id, implement: `Сеялка ${i + 1}` }));
    const plan = { seasonId, name: "Посев", plannedStart: today, plannedEnd: today, plannedAreaHa: 100, plannedRatePerHa: 1100,
      responsible: "не доверять", plannedMechanicEmployeeId: people[0].id, plannedEquipmentId: machines[0].id,
      plannedEquipment: "не доверять", plannedImplement: "Сеялка 1", notes: "", plannedAssignments: assignments };
    await call("agronomist", "POST", "/agro/fields/operations", plan, 403);
    await call("chief_agronomist", "POST", "/agro/fields/operations", { ...plan, plannedAssignments: [assignments[0], assignments[0]] }, 400);
    await call("chief_agronomist", "POST", "/agro/fields/operations", { ...plan, plannedAssignments: [assignments[0], { ...assignments[1], employeeId: people[0].id }] }, 400);
    let op = await call("chief_agronomist", "POST", "/agro/fields/operations", plan, 201);
    assert.equal(op.plannedAssignments.length, 2);
    assert.equal(op.plannedAssignments[1].employeeName, people[1].fullName);
    const actual = { version: op.version, actualStart: today, actualEnd: null, actualAreaHa: 0, actualOperationName: "Посев",
      actualMechanic: people[0].fullName, actualMechanicEmployeeId: people[0].id,
      actualEquipment: `Трактор · ${machines[0].registrationNumber}`, actualImplement: "Сеялка 1", actualNotes: "", actualAssignments: assignments };
    op = await call("agronomist", "PATCH", `/agro/fields/operations/${op.id}/actual`, actual);
    const daily = { operationVersion: op.version, reportDate: today, cumulativeAreaHa: 30,
      actualMechanic: "", actualMechanicEmployeeId: null, actualEquipment: "", actualImplement: "", notes: "",
      machineReports: assignments.map((r, i) => ({ ...r, employeeName: "подмена", dailyAreaHa: i ? 20 : 10, ratePerHa: i ? 1200 : 1100 })) };
    await call("agronomist", "POST", `/agro/fields/operations/${op.id}/progress`, daily, 403);
    await call("dispatcher", "POST", `/agro/fields/operations/${op.id}/progress`, { ...daily, cumulativeAreaHa: 40 }, 400);
    op = await call("dispatcher", "POST", `/agro/fields/operations/${op.id}/progress`, daily, 201);
    assert.equal(op.actualAreaHa, 30);
    assert.equal(op.progressReports[0].machineReports[1].employeeName, people[1].fullName);
    assert.equal(op.actualPayAmount, 35000);
    const progressId = op.progressReports[0].id;
    // Current resources can change without rewriting the day's machine snapshots.
    op = await call("agronomist", "PATCH", `/agro/fields/operations/${op.id}/actual`, {
      ...actual, version: op.version, actualAreaHa: 30, actualAssignments: [assignments[0]],
    });
    assert.equal(op.actualAssignments.length, 1);
    assert.equal(op.progressReports[0].machineReports.length, 2);
    await db.transaction(async tx => {
      const groups = await calculateAutomaticAccruals(tx, "brigade");
      const entries = groups.flatMap(g => g.entries).filter(e => e.sourceType === "field_progress" && e.sourceId === progressId);
      assert.deepEqual(entries.map(e => [e.employeeId, e.amountKzt]), [[people[0].id, 11000], [people[1].id, 24000]]);
      const [register] = await tx.insert(payrollRegistersTable).values({
        workDate: today, unit, status: "sent_to_economist", hrApprovedAt: new Date(), createdByUserId: key, createdByName: key, totalAmount: "35000",
      }).returning();
      registerId = register.id;
      await tx.insert(payrollRegisterItemsTable).values(entries.map(e => ({ ...e, registerId, amountKzt: e.amountKzt.toFixed(2) })));
      const remaining = await calculateAutomaticAccruals(tx, "brigade");
      assert.equal(remaining.flatMap(g => g.entries).filter(e => e.sourceType === "field_progress" && e.sourceId === progressId).length, 0);
      const costs = await fieldCosts(tx, seasonId);
      assert.equal(costs!.salaryCost, 35000);
      assert.equal(costs!.operations[0].salaries.length, 2);
    });
    await call("dispatcher", "PATCH", `/agro/fields/operations/${op.id}/progress/${progressId}`, { ...daily, operationVersion: op.version, version: 1 }, 409);
    const snapshot = op.progressReports[0].machineReports;
    assert.throws(() => resolveMachineReports(daily.machineReports, snapshot, 3000, { cumulativeAreaAres: 5000, machineReports: snapshot }, 3000), /следующий день/);
  } finally {
    if (registerId) await db.delete(payrollRegistersTable).where(eq(payrollRegistersTable.id, registerId));
    if (seasonId) await db.delete(fieldOperationsTable).where(eq(fieldOperationsTable.seasonId, seasonId));
    if (seasonId) await db.delete(fieldSeasonsTable).where(eq(fieldSeasonsTable.id, seasonId));
    if (fieldId) await db.delete(agroFieldsTable).where(eq(agroFieldsTable.id, fieldId));
    if (machineIds.length) await db.delete(fleetEquipmentTable).where(inArray(fleetEquipmentTable.id, machineIds));
    if (employeeIds.length) await db.delete(employeesTable).where(inArray(employeesTable.id, employeeIds));
    await db.delete(activityTable).where(eq(activityTable.userName, `${key} · chief_agronomist`));
    await db.delete(activityTable).where(eq(activityTable.userName, `${key} · agronomist`));
    await db.delete(activityTable).where(eq(activityTable.userName, `${key} · dispatcher`));
    await new Promise<void>(r => server.close(() => r()));
  }
});
