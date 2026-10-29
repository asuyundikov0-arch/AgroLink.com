import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express, { type RequestHandler } from "express";
import { eq, inArray, like } from "drizzle-orm";
import {
  db, pool, activityTable, agroFieldsTable, fieldSeasonsTable, fieldOperationsTable,
  fieldOperationProgressTable, fleetEquipmentTable, employeesTable,
  chemicalInvoicesTable, chemicalBatchesTable, chemicalRequestsTable, chemicalIssuesTable,
  chemicalContainerReturnsTable, chemicalConsumptionsTable,
  payrollRegistersTable, payrollRegisterItemsTable,
} from "@workspace/db";
import fieldsRouter from "../routes/agro-fields";
import chemicalsRouter from "../routes/chemicals";
import { grainBusinessDate } from "./grain-ledger";
import { calculateAutomaticAccruals } from "../routes/payroll-registers";

after(() => pool.end());

/**
 * Exercise the real controllers and per-action role guards on an ephemeral loopback
 * server. Clerk authentication itself is intentionally not replaced in the running app:
 * this test harness supplies an already authenticated identity only to its own server.
 */
test("HTTP controllers: planned/unplanned approval, dispatcher-only hectares, tare expense and completion", async () => {
  const key = `workflow-http-${randomUUID()}`;
  const today = grainBusinessDate();
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const role = String(req.headers["x-test-role"] ?? "");
    res.locals.access = { userId: `${key}-${role}`, role, displayName: key, email: "", department: "" };
    next();
  });
  // Preserve each endpoint's genuine role guard and validation/business handlers.
  type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
  for (const router of [fieldsRouter, chemicalsRouter]) {
    for (const layer of (router as unknown as { stack: Layer[] }).stack) {
      if (!layer.route) continue;
      const r = layer.route;
      for (const method of ["get", "post", "patch", "put"] as const) {
        if (r.methods[method]) app[method](r.path, ...r.stack.map(s => s.handle));
      }
    }
  }
  app.use(((err, _req, res, _next) => {
    res.status(500).json({ error: String(err) });
  }) as express.ErrorRequestHandler);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(role: string, method: string, path: string, data?: unknown, status = 200) {
    const res = await fetch(`${base}${path}`, {
      method, headers: { "x-test-role": role, "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const json = await res.json() as any;
    assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(json)}`);
    return json;
  }
  let fieldId = 0, seasonId = 0;
  let employeeIds: number[] = [], machineIds: number[] = [];
  try {
    const [field] = await db.insert(agroFieldsTable).values({
      unit: "АПК Арыстан Grain", number: key, numberKey: key, areaAres: 12000, updatedBy: key,
    }).returning();
    fieldId = field.id;
    const [season] = await db.insert(fieldSeasonsTable).values({
      fieldId, year: Number(today.slice(0, 4)), cropName: "Пшеница", areaAres: 12000, updatedBy: key,
    }).returning();
    seasonId = season.id;
    const employees = await db.insert(employeesTable).values([1, 2].map(n => ({
      fullName: `${key}-${n}`, createdBy: key, updatedBy: key,
    }))).returning();
    employeeIds = employees.map(e => e.id);
    const machines = await db.insert(fleetEquipmentTable).values([1, 2].map(n => ({
      kind: "Трактор", registrationNumber: `${key}-${n}`, registrationKey: `${key}-${n}`, unit: field.unit, updatedBy: key,
    }))).returning();
    machineIds = machines.map(m => m.id);
    const label = (n: number) => `${machines[n].kind} · ${machines[n].registrationNumber}`;
    const invoice = await call("grain_manager", "POST", "/agro/chemicals/invoices", {
      requestId: randomUUID(), number: key, supplier: key, occurredOn: yesterday, farm: field.unit,
      lines: [{ name: key, unit: "л", quantity: 200, unitPrice: 1500, containerVolume: 20, containerCount: 10 }],
    }, 201);
    const [batch] = await db.select().from(chemicalBatchesTable).where(eq(chemicalBatchesTable.invoiceId, invoice.id));
    const plan = {
      seasonId, name: "Культивация", plannedStart: yesterday, plannedEnd: today, plannedAreaHa: 120,
      plannedRatePerHa: 1100, responsible: employees[0].fullName, plannedMechanicEmployeeId: employeeIds[0],
      plannedFuelCost: 12345.67,
      plannedEquipmentId: machineIds[0], plannedEquipment: label(0), plannedImplement: "Агрегат 1", notes: "",
      requiresChemicals: true, chemicalPlan: [{ batchId: batch.id, ratePerHa: 0.35 }],
    };
    await call("agronomist", "POST", "/agro/fields/operations", plan, 403);
    let op = await call("chief_agronomist", "POST", "/agro/fields/operations", plan, 201);
    assert.equal(op.plannedFuelCost, 12345.67);
    await call("chief_agronomist", "POST", "/agro/fields/operations", { ...plan, plannedFuelCost: -1 }, 400);
    await call("chief_agronomist", "POST", "/agro/fields/operations", { ...plan, plannedFuelCost: 0.001 }, 400);
    await call("chief_agronomist", "PATCH", `/agro/fields/operations/${op.id}`, { ...plan, version: op.version, seasonId: seasonId + 1 }, 409);
    op = await call("chief_agronomist", "PATCH", `/agro/fields/operations/${op.id}`, { ...plan, version: op.version, plannedFuelCost: 23456.78 });
    assert.equal(op.plannedFuelCost, 23456.78);
    const { plannedFuelCost: _fuel, ...legacyPlan } = plan;
    op = await call("chief_agronomist", "PATCH", `/agro/fields/operations/${op.id}`, { ...legacyPlan, version: op.version });
    assert.equal(op.plannedFuelCost, 23456.78, "Omitted optional fuel budget preserves the existing plan");
    const dashboard = await call("chief_agronomist", "GET", "/agro/fields");
    assert.equal(dashboard.operations.find((item: any) => item.id === op.id).plannedFuelCost, 23456.78);
    const actual = (o: any, employee = 0) => ({
      version: o.version, actualStart: o.actualStart || yesterday, actualEnd: null, actualAreaHa: o.actualAreaHa,
      actualOperationName: o.name, actualMechanic: employees[employee].fullName, actualMechanicEmployeeId: employeeIds[employee],
      actualEquipment: label(employee), actualImplement: `Агрегат ${employee + 1}`, actualNotes: o.actualNotes,
    });
    await call("dispatcher", "PATCH", `/agro/fields/operations/${op.id}/actual`, actual(op), 403);
    op = await call("agronomist", "PATCH", `/agro/fields/operations/${op.id}/actual`, actual(op));
    let flow = await call("grain_manager", "GET", "/agro/chemicals/workflow");
    const request = flow.requests.find((r: any) => r.operationId === op.id);
    assert.equal(request.quantity, 60);
    const dispatch = await call("dispatcher", "GET", "/agro/fields/dispatch");
    assert.ok(dispatch.some((r: any) => r.id === op.id && r.operation.progressReports.length === 0));
    assert.equal(dispatch.find((r: any) => r.id === op.id).fuelCost, 0, "Planned fuel budget is not an actual fuel expense");
    const issue = await call("grain_manager", "POST", "/agro/chemicals/issues", {
      requestId: randomUUID(), chemicalRequestId: request.id, quantity: 60, occurredOn: yesterday, notes: "",
    }, 201);
    const daily = (date: string, area: number) => ({
      operationVersion: op.version, reportDate: date, cumulativeAreaHa: area,
      actualRatePerHa: 1100,
      // Spoofed input must not override the agronomist's current assignments.
      actualMechanic: employees[1].fullName, actualMechanicEmployeeId: employeeIds[1],
      actualEquipment: label(1), actualImplement: "Подмена", notes: "",
    });
    await call("agronomist", "POST", `/agro/fields/operations/${op.id}/progress`, daily(yesterday, 100), 403);
    for (const invalidRate of [0, -1, 1.001, 1_000_000_001]) {
      await call("dispatcher", "POST", `/agro/fields/operations/${op.id}/progress`, { ...daily(yesterday, 100), actualRatePerHa: invalidRate }, 400);
    }
    op = await call("dispatcher", "POST", `/agro/fields/operations/${op.id}/progress`, daily(yesterday, 100), 201);
    assert.equal(op.progressReports[0].actualRatePerHa, 1100);
    assert.equal(op.plannedRatePerHa, plan.plannedRatePerHa);
    const reload = await call("dispatcher", "GET", "/agro/fields/dispatch");
    assert.equal(reload.find((row: any) => row.id === op.id).operation.progressReports[0].actualRatePerHa, 1100);
    assert.equal(op.progressReports[0].actualMechanicEmployeeId, employeeIds[0]);
    op = await call("agronomist", "PATCH", `/agro/fields/operations/${op.id}/actual`, actual(op, 1));
    op = await call("dispatcher", "POST", `/agro/fields/operations/${op.id}/progress`, { ...daily(today, 120), actualRatePerHa: 1250 }, 201);
    assert.equal(op.progressReports[0].actualRatePerHa, 1100, "Another day's rate must not change");
    assert.equal(op.progressReports[1].actualRatePerHa, 1250);
    const accruals = await db.transaction(tx => calculateAutomaticAccruals(tx));
    const lines = accruals.flatMap(day => day.entries).filter(line =>
      line.sourceType === "field_progress" && op.progressReports.some((r: any) => r.id === line.sourceId));
    assert.deepEqual(lines.map(line => line.amountKzt).sort((a, b) => a - b), [25000, 110000]);
    assert.equal(op.progressReports[0].actualMechanicEmployeeId, employeeIds[0]);
    assert.equal(op.progressReports[1].actualMechanicEmployeeId, employeeIds[1]);
    assert.equal(op.progressReports[1].actualImplement, "Агрегат 2");
    flow = await call("grain_manager", "GET", "/agro/chemicals/workflow");
    assert.equal(flow.dailyExpectations.find((e: any) => e.operationId === op.id && e.reportDate === yesterday).expectedQuantity, 35);
    assert.equal(flow.dailyExpectations.find((e: any) => e.operationId === op.id && e.reportDate === yesterday).expectedContainerCount, 1.75);
    const tare = { requestId: randomUUID(), issueId: issue.id, reportDate: yesterday, returnedOn: today, containerCount: 2, notes: "" };
    const receipt = await call("grain_manager", "POST", "/agro/chemicals/container-returns", tare, 201);
    assert.equal((await call("grain_manager", "POST", "/agro/chemicals/container-returns", tare, 201)).id, receipt.id);
    await call("dispatcher", "POST", "/agro/chemicals/consumptions", {
      requestId: randomUUID(), containerReturnId: receipt.id, notes: "",
    }, 403);
    flow = await call("grain_manager", "GET", "/agro/chemicals/workflow");
    assert.equal(flow.custody.find((c: any) => c.issueId === issue.id).remaining, 20);
    assert.equal(flow.dailyExpectations.find((e: any) => e.operationId === op.id && e.reportDate === yesterday).deviationQuantity, 5);
    await call("grain_manager", "POST", "/agro/chemicals/container-returns", { ...tare, requestId: randomUUID(), containerCount: 2 }, 409);
    const first = op.progressReports[0];
    await call("dispatcher", "PATCH", `/agro/fields/operations/${op.id}/progress/${first.id}`, {
      ...daily(yesterday, 99), version: first.version,
    }, 409);
    op = await call("dispatcher", "PATCH", `/agro/fields/operations/${op.id}/progress/${first.id}`, {
      ...daily(yesterday, 100), version: first.version, notes: "Примечание без изменения гектаров",
    });
    await call("grain_manager", "POST", "/agro/chemicals/container-returns", {
      ...tare, requestId: randomUUID(), reportDate: today, containerCount: 1,
    }, 201);
    const stock = await call("grain_manager", "GET", "/agro/chemicals");
    assert.ok(stock.batches.some((b: any) => b.id === batch.id));
    assert.equal((await db.select().from(chemicalBatchesTable).where(eq(chemicalBatchesTable.id, batch.id)))[0].remainingMillis, 140000);
    flow = await call("agronomist", "GET", "/agro/chemicals/workflow");
    assert.equal(flow.custody.find((c: any) => c.issueId === issue.id).remaining, 0);
    assert.equal(flow.consumptions.filter((c: any) => c.operationId === op.id).reduce((s: number, c: any) => s + c.amount, 0), 90000);
    await call("agronomist", "POST", `/agro/fields/operations/${op.id}/lifecycle`, {
      version: op.version, action: "request_completion", date: today,
    }, 403);
    op = await call("dispatcher", "POST", `/agro/fields/operations/${op.id}/lifecycle`, {
      version: op.version, action: "request_completion", date: today,
    });
    assert.equal(op.actualEnd, null);
    await call("chief_agronomist", "POST", `/agro/fields/operations/${op.id}/lifecycle`, {
      version: op.version, action: "approve_completion",
    }, 403);
    await call("dispatcher", "POST", `/agro/fields/operations/${op.id}/progress`, daily(today, 120), 409);
    op = await call("agronomist", "POST", `/agro/fields/operations/${op.id}/lifecycle`, {
      version: op.version, action: "approve_completion",
    });
    assert.equal(op.status, "completed");
    assert.equal(op.progressReports.length, 2);
    let unplanned = await call("agronomist", "POST", "/agro/fields/unplanned-operations", {
      seasonId, name: "Посев", occurredOn: today, areaHa: 0, completed: false,
      employeeId: employeeIds[0], equipmentId: machineIds[0], implement: "Сеялка", notes: "",
      requiresChemicals: false, chemicalPlan: [],
    }, 201);
    assert.equal(unplanned.approvalStatus, "pending");
    assert.equal(unplanned.actualStart, null);
    await call("agronomist", "PATCH", `/agro/fields/operations/${unplanned.id}/actual`, actual(unplanned), 409);
    await call("agronomist", "POST", `/agro/fields/operations/${unplanned.id}/lifecycle`, {
      version: unplanned.version, action: "approve_unplanned",
    }, 403);
    unplanned = await call("chief_agronomist", "POST", `/agro/fields/operations/${unplanned.id}/lifecycle`, {
      version: unplanned.version, action: "approve_unplanned",
    });
    unplanned = await call("agronomist", "PATCH", `/agro/fields/operations/${unplanned.id}/actual`, actual(unplanned));
    assert.equal(unplanned.status, "in_progress");
    unplanned = await call("dispatcher", "POST", `/agro/fields/operations/${unplanned.id}/progress`, {
      ...daily(yesterday, 20), operationVersion: unplanned.version, actualRatePerHa: 500,
    }, 201);
    const savedDay = unplanned.progressReports[0];
    const [register] = await db.insert(payrollRegistersTable).values({
      workDate: yesterday, unit: key, status: "awaiting_hr", totalAmount: "10000.00",
      createdByUserId: key, createdByName: key,
    }).returning();
    await db.insert(payrollRegisterItemsTable).values({
      registerId: register.id, employeeId: employeeIds[0], employeeName: employees[0].fullName,
      workType: "Полевые работы", amountKzt: "10000.00", sourceType: "field_progress", sourceId: savedDay.id,
    });
    await call("dispatcher", "PATCH", `/agro/fields/operations/${unplanned.id}/progress/${savedDay.id}`, {
      ...daily(yesterday, 20), operationVersion: unplanned.version, version: savedDay.version, actualRatePerHa: 600,
    }, 409);
    unplanned = await call("agronomist", "PATCH", `/agro/fields/operations/${unplanned.id}/actual`, actual(unplanned, 1));
    unplanned = await call("dispatcher", "POST", `/agro/fields/operations/${unplanned.id}/progress`, {
      ...daily(today, 40), operationVersion: unplanned.version, actualRatePerHa: 600,
    }, 201);
    assert.equal(unplanned.progressReports[0].actualRatePerHa, 500);
    assert.equal(unplanned.progressReports[1].actualRatePerHa, 600);
    const nextAccruals = await db.transaction(tx => calculateAutomaticAccruals(tx));
    const nextLine = nextAccruals.flatMap(day => day.entries).find(line =>
      line.sourceType === "field_progress" && line.sourceId === unplanned.progressReports[1].id);
    assert.equal(nextLine?.amountKzt, 12000);
    assert.equal(nextLine?.employeeId, employeeIds[1]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await db.delete(payrollRegistersTable).where(eq(payrollRegistersTable.createdByUserId, key));
    if (seasonId) {
      const ops = await db.select({ id: fieldOperationsTable.id }).from(fieldOperationsTable).where(eq(fieldOperationsTable.seasonId, seasonId));
      const ids = ops.map(o => o.id);
      if (ids.length) {
        await db.delete(chemicalConsumptionsTable).where(inArray(chemicalConsumptionsTable.operationId, ids));
        await db.delete(chemicalContainerReturnsTable).where(inArray(chemicalContainerReturnsTable.operationId, ids));
        const requests = await db.select({ id: chemicalRequestsTable.id }).from(chemicalRequestsTable).where(inArray(chemicalRequestsTable.operationId, ids));
        if (requests.length) await db.delete(chemicalIssuesTable).where(inArray(chemicalIssuesTable.chemicalRequestId, requests.map(r => r.id)));
        await db.delete(chemicalRequestsTable).where(inArray(chemicalRequestsTable.operationId, ids));
        await db.delete(fieldOperationProgressTable).where(inArray(fieldOperationProgressTable.operationId, ids));
        await db.delete(fieldOperationsTable).where(inArray(fieldOperationsTable.id, ids));
      }
      await db.delete(fieldSeasonsTable).where(eq(fieldSeasonsTable.id, seasonId));
    }
    const invoices = await db.select({ id: chemicalInvoicesTable.id }).from(chemicalInvoicesTable).where(eq(chemicalInvoicesTable.number, key));
    if (invoices.length) {
      await db.delete(chemicalBatchesTable).where(inArray(chemicalBatchesTable.invoiceId, invoices.map(i => i.id)));
      await db.delete(chemicalInvoicesTable).where(inArray(chemicalInvoicesTable.id, invoices.map(i => i.id)));
    }
    if (fieldId) await db.delete(agroFieldsTable).where(eq(agroFieldsTable.id, fieldId));
    if (machineIds.length) await db.delete(fleetEquipmentTable).where(inArray(fleetEquipmentTable.id, machineIds));
    if (employeeIds.length) await db.delete(employeesTable).where(inArray(employeesTable.id, employeeIds));
    await db.delete(activityTable).where(like(activityTable.userName, `${key}%`));
  }
});
